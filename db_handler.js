// ==========================================
// KONEKSI DATABASE (SHEET.BEST)
// ==========================================
// URL API Sheet.best Perusahaan (Owner Mode)
const SHEETBEST_URL = 'https://api.sheetbest.com/sheets/dfdd73c7-8607-45af-a9a2-cec54ba4bdc6';

// Nama Key di LocalStorage
const DB_KEY = 'MIJ_ERP_v2';

// Struktur Data Standar
const defaultDB = {
    invoices: [],
    clients: [],
    projects: [],
    payments: [],
    leads: [],
    settings: {}
};

window.MIJ_DB = {
    // 1. Inisialisasi
    init: function() {
        if (!localStorage.getItem(DB_KEY)) {
            localStorage.setItem(DB_KEY, JSON.stringify(defaultDB));
        }
    },

    // 2. Ambil Semua Data
    getAllData: function() {
        return JSON.parse(localStorage.getItem(DB_KEY) || JSON.stringify(defaultDB));
    },

    // 3. Simpan Data ke Lokal
    saveData: function(newData) {
        localStorage.setItem(DB_KEY, JSON.stringify(newData));
    },

    // 4. SYNC MANAGER (Upload / Download)
    manualSyncToCloud: async function() {
        const { isConfirmed, isDenied } = await Swal.fire({
            title: 'Sinkronisasi Database',
            text: 'Pilih arah sinkronisasi data:',
            icon: 'question',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: '⬆️ UPLOAD (Kirim ke Cloud)',
            denyButtonText: '⬇️ DOWNLOAD (Ambil dari Cloud)',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#0f172a',
            denyButtonColor: '#2563eb'
        });

        if (isConfirmed) await this.uploadToCloud();
        else if (isDenied) await this.downloadFromCloud();
    },

    // A. LOGIKA UPLOAD (HP -> SPREADSHEET)
    uploadToCloud: async function() {
        Swal.fire({ title: 'Mengupload Data...', text: 'Termasuk Pengaturan & Profil...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const db = this.getAllData();
            const set = db.settings || {};

            // 1. Format Invoices
            const dataInv = db.invoices.map(i => ({
                No_Invoice: i.no, Tanggal: i.date, Klien: i.clientName, Total: i.grandTotal,
                Status: i.status, Dibayar: i.paidAmount || 0, Sisa: i.grandTotal - (i.paidAmount || 0),
                Update_Terakhir: new Date().toISOString().split('T')[0]
            }));

            // 2. Format Clients
            const dataCli = db.clients.map(c => ({
                ID: c.id, Nama: c.name, Perusahaan: c.company, Email: c.email, Telepon: c.phone
            }));

            // 3. Format Projects
            const dataProj = db.projects.map(p => ({
                ID: p.id, Nama_Proyek: p.name, Klien: p.clientName, Progress: p.progress, Status: p.kanbanStatus, Update: p.deadline
            }));

            // 4. Format Payments
            const dataPay = db.payments.map(p => ({
                Tanggal: p.date, No_Invoice: p.invoiceNo, Jumlah: p.amount, Metode: p.method, ID_Transaksi: p.id
            }));

            // 5. Format Settings (BARU)
            // Kita bungkus dalam array karena Sheet.best butuh array
            const dataSet = [{
                Company_Name: set.companyName || '',
                Tagline: set.tagline || '',
                Address: set.address || '',
                Email: set.email || '',
                Phone: set.phone || '',
                Bank_Name: set.bankName || '',
                Bank_Acc: set.bankAccount || '',
                Bank_Holder: set.bankHolder || ''
            }];

            // --- EKSEKUSI UPLOAD PARALEL ---
            await Promise.all([
                fetch(SHEETBEST_URL + '/0', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dataInv) }),
                fetch(SHEETBEST_URL + '/tabs/Clients', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dataCli) }),
                fetch(SHEETBEST_URL + '/tabs/Projects', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dataProj) }),
                fetch(SHEETBEST_URL + '/tabs/Payments', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dataPay) }),
                fetch(SHEETBEST_URL + '/tabs/Settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dataSet) }) // Tab Baru
            ]);

            Swal.fire('Sukses!', 'Data & Pengaturan tersimpan di Cloud.', 'success');

        } catch (error) {
            console.error(error); Swal.fire('Gagal Upload', 'Cek koneksi internet.', 'error');
        }
    },

    // B. LOGIKA DOWNLOAD (SPREADSHEET -> HP)
    downloadFromCloud: async function() {
        Swal.fire({ title: 'Mendownload Data...', text: 'Mengambil Data & Pengaturan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            // Fetch Semua Tab
            const [resInv, resCli, resProj, resPay, resSet] = await Promise.all([
                fetch(SHEETBEST_URL + '/0'),
                fetch(SHEETBEST_URL + '/tabs/Clients'),
                fetch(SHEETBEST_URL + '/tabs/Projects'),
                fetch(SHEETBEST_URL + '/tabs/Payments'),
                fetch(SHEETBEST_URL + '/tabs/Settings')
            ]);

            const rawInv = await resInv.json();
            const rawCli = await resCli.json();
            const rawProj = await resProj.json();
            const rawPay = await resPay.json();
            const rawSet = await resSet.json();

            // 1. Restore Invoices
            const newInvoices = rawInv.map((row, idx) => ({
                id: Date.now() + idx, no: row.No_Invoice, clientName: row.Klien, date: row.Tanggal,
                grandTotal: Number(row.Total), status: row.Status, paidAmount: Number(row.Dibayar),
                items: [{ desc: 'Restored Data', qty: 1, price: Number(row.Total) }]
            }));

            // 2. Restore Clients
            const newClients = rawCli.map(row => ({
                id: Number(row.ID) || Date.now(), name: row.Nama, company: row.Perusahaan,
                email: row.Email, phone: row.Telepon, type: (row.Perusahaan && row.Perusahaan !== '-') ? 'Perusahaan' : 'Individu'
            }));

            // 3. Restore Projects
            const newProjects = rawProj.map(row => ({
                id: Number(row.ID) || Date.now(), name: row.Nama_Proyek, clientName: row.Klien,
                progress: Number(row.Progress), kanbanStatus: row.Status || 'todo', deadline: row.Update
            }));

            // 4. Restore Payments
            const newPayments = rawPay.map(row => ({
                id: Number(row.ID_Transaksi) || Date.now(), date: row.Tanggal, invoiceNo: row.No_Invoice,
                amount: Number(row.Jumlah), method: row.Metode
            }));

            // 5. Restore Settings (BARU)
            let newSettings = {};
            if (rawSet.length > 0) {
                const s = rawSet[0]; // Ambil baris pertama
                newSettings = {
                    companyName: s.Company_Name, tagline: s.Tagline, address: s.Address,
                    email: s.Email, phone: s.Phone,
                    bankName: s.Bank_Name, bankAccount: s.Bank_Acc, bankHolder: s.Bank_Holder
                };
            }

            // SIMPAN KE LOCAL STORAGE
            const db = this.getAllData();
            db.invoices = newInvoices;
            db.clients = newClients;
            db.projects = newProjects;
            db.payments = newPayments;
            db.settings = newSettings; // Update Settings
            
            this.saveData(db);

            Swal.fire({
                title: 'Download Berhasil!',
                text: 'Aplikasi siap digunakan dengan data terbaru.',
                icon: 'success'
            }).then(() => { parent.location.reload(); });

        } catch (error) {
            console.error(error); Swal.fire('Gagal Download', 'Pastikan Tab Settings sudah dibuat di Sheet.', 'error');
        }
    }
};