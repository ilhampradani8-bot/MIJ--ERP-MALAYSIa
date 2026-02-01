// ==========================================
// KONEKSI DATABASE (SMART SYNC V4 - ID ABADI)
// ==========================================
const SHEETBEST_URL = 'https://api.sheetbest.com/sheets/dfdd73c7-8607-45af-a9a2-cec54ba4bdc6';
const DB_KEY = 'MIJ_ERP_v2';

const defaultDB = { invoices: [], clients: [], projects: [], payments: [], leads: [], settings: {} };

window.MIJ_DB = {
    init: function() {
        if (!localStorage.getItem(DB_KEY)) localStorage.setItem(DB_KEY, JSON.stringify(defaultDB));
    },

    getAllData: function() {
        let data = JSON.parse(localStorage.getItem(DB_KEY));
        if(!data) return defaultDB;
        if(!data.invoices) data.invoices = [];
        if(!data.clients) data.clients = [];
        if(!data.settings) data.settings = {};
        return data;
    },

    saveData: function(newData) {
        localStorage.setItem(DB_KEY, JSON.stringify(newData));
    },

    // --- SMART SYNC (1 TOMBOL AJAIB) ---
    manualSyncToCloud: async function() {
        Swal.fire({ title: 'Smart Sync...', text: 'Mencocokkan data antar perangkat...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            // 1. AMBIL DATA CLOUD (SUMBER KEBENARAN SEMENTARA)
            const [resInv, resCli, resProj, resPay, resSet] = await Promise.all([
                fetch(SHEETBEST_URL + '/0'), fetch(SHEETBEST_URL + '/tabs/Clients'),
                fetch(SHEETBEST_URL + '/tabs/Projects'), fetch(SHEETBEST_URL + '/tabs/Payments'),
                fetch(SHEETBEST_URL + '/tabs/Settings')
            ]);

            // Mapping Data Cloud (PENTING: BACA ID_UNIK)
            const cloudDB = {
                invoices: (await resInv.json()).map(r => this.parseInvoice(r)),
                clients: (await resCli.json()).map(r => this.parseClient(r)),
                projects: (await resProj.json()).map(r => this.parseProject(r)),
                payments: (await resPay.json()).map(r => this.parsePayment(r)),
                settings: this.parseSettings(await resSet.json())
            };

            // 2. AMBIL DATA LOKAL (HP)
            const localDB = this.getAllData();

            // 3. MERGE (GABUNGKAN BERDASARKAN ID & WAKTU)
            const finalDB = {
                invoices: this.mergeData(localDB.invoices, cloudDB.invoices),
                clients: this.mergeData(localDB.clients, cloudDB.clients),
                projects: this.mergeData(localDB.projects, cloudDB.projects),
                payments: this.mergeData(localDB.payments, cloudDB.payments),
                leads: localDB.leads || [], // Leads tetap lokal
                settings: this.mergeSingle(localDB.settings, cloudDB.settings)
            };

            // 4. SIMPAN HASIL GABUNGAN KE HP
            this.saveData(finalDB);

            // 5. UPDATE CLOUD DENGAN DATA FINAL (SUPAYA HP LAIN KEBAGIAN)
            await this.pushToCloud(finalDB);

            Swal.fire({ 
                icon: 'success', 
                title: 'Sinkronisasi Tuntas!', 
                text: `Data Lokal & Cloud sekarang identik.`, 
                timer: 2000, 
                showConfirmButton: false 
            }).then(() => parent.location.reload());

        } catch (error) {
            console.error('Sync Error:', error);
            Swal.fire('Gagal Sync', 'Pastikan kolom ID_Unik ada di Google Sheet.', 'error');
        }
    },

    // --- LOGIKA UTAMA: MERGE BERDASARKAN ID ---
    mergeData: function(localArr, cloudArr) {
        const map = new Map();

        // 1. Masukkan semua data LOKAL ke Map
        // Jika HP kosong, tahap ini dilewati (Aman)
        localArr.forEach(item => {
            if(item.id) map.set(String(item.id), item);
        });

        // 2. Bandingkan dengan data CLOUD
        cloudArr.forEach(cloudItem => {
            const id = String(cloudItem.id);
            
            if (!id || id === 'undefined') return; // Skip data sampah

            if (map.has(id)) {
                // KONFLIK: ID sama, data mana yang lebih baru?
                const localItem = map.get(id);
                const localTime = new Date(localItem.updated_at || 0).getTime();
                const cloudTime = new Date(cloudItem.updated_at || 0).getTime();

                // Logic: Yang update-nya lebih baru, dia yang menang
                if (cloudTime > localTime) {
                    map.set(id, cloudItem); // Timpa lokal dengan cloud
                }
                // Jika Local lebih baru, biarkan Local di Map
            } else {
                // ID ini tidak ada di HP, tapi ada di Cloud -> Berarti data baru dari HP lain
                map.set(id, cloudItem);
            }
        });

        return Array.from(map.values());
    },

    mergeSingle: function(local, cloud) {
        // Khusus Settings (Cuma 1 objek)
        const localTime = new Date(local.updated_at || 0).getTime();
        const cloudTime = new Date(cloud.updated_at || 0).getTime();
        return (cloudTime > localTime) ? cloud : local;
    },

    // --- PARSERS (Ubah Kolom Sheet -> Object App) ---
    // PENTING: ID_Unik dari sheet dipaksa jadi ID di App
    parseInvoice: function(r) {
        return {
            id: Number(r.ID_Unik), // JANGAN Date.now(), TAPI AMBIL DARI SHEET!
            no: r.No_Invoice, clientName: r.Klien, date: r.Tanggal, 
            grandTotal: Number(r.Total), status: r.Status, paidAmount: Number(r.Dibayar),
            updated_at: r.Last_Update, deleted: r.Is_Deleted === 'TRUE',
            items: [{desc: 'Data Loaded', qty:1, price: Number(r.Total)}] // Dummy items
        };
    },
    parseClient: function(r) {
        return {
            id: Number(r.ID_Unik),
            name: r.Nama, company: r.Perusahaan, email: r.Email, phone: r.Telepon,
            type: (r.Perusahaan && r.Perusahaan !== '-') ? 'Perusahaan' : 'Individu',
            updated_at: r.Last_Update, deleted: r.Is_Deleted === 'TRUE'
        };
    },
    parseProject: function(r) {
        return {
            id: Number(r.ID_Unik),
            name: r.Nama_Proyek, clientName: r.Klien, progress: Number(r.Progress), 
            kanbanStatus: r.Status, deadline: r.Update,
            updated_at: r.Last_Update, deleted: r.Is_Deleted === 'TRUE'
        };
    },
    parsePayment: function(r) {
        return {
            id: Number(r.ID_Unik), // Di sheet namanya ID_Unik juga (tadinya ID_Transaksi)
            date: r.Tanggal, invoiceNo: r.No_Invoice, amount: Number(r.Jumlah), method: r.Metode,
            updated_at: r.Last_Update, deleted: r.Is_Deleted === 'TRUE'
        };
    },
    parseSettings: function(arr) {
        if(!arr || arr.length === 0) return {};
        const r = arr[0];
        return {
            companyName: r.Company_Name, tagline: r.Tagline, address: r.Address,
            email: r.Email, phone: r.Phone, bankName: r.Bank_Name, bankAccount: r.Bank_Acc, bankHolder: r.Bank_Holder,
            updated_at: r.Last_Update
        };
    },

    // --- PUSH TO CLOUD (Ubah Object App -> Kolom Sheet) ---
    pushToCloud: async function(db) {
        // Helper: Convert array object ke format sheet
        const prep = (arr, mapper) => arr.map(item => ({
            ...mapper(item),
            ID_Unik: item.id, // ID LOKAL WAJIB NAIK KE KOLOM ID_UNIK
            Last_Update: item.updated_at || new Date().toISOString(),
            Is_Deleted: item.deleted ? 'TRUE' : 'FALSE'
        }));

        const dInv = prep(db.invoices, i => ({ No_Invoice: i.no, Tanggal: i.date, Klien: i.clientName, Total: i.grandTotal, Status: i.status, Dibayar: i.paidAmount }));
        const dCli = prep(db.clients, c => ({ Nama: c.name, Perusahaan: c.company, Email: c.email, Telepon: c.phone }));
        const dProj = prep(db.projects, p => ({ Nama_Proyek: p.name, Klien: p.clientName, Progress: p.progress, Status: p.kanbanStatus, Update: p.deadline }));
        const dPay = prep(db.payments, p => ({ Tanggal: p.date, No_Invoice: p.invoiceNo, Jumlah: p.amount, Metode: p.method }));
        
        const s = db.settings || {};
        const dSet = [{
            Company_Name: s.companyName, Tagline: s.tagline, Address: s.address, Email: s.email, Phone: s.phone,
            Bank_Name: s.bankName, Bank_Acc: s.bankAccount, Bank_Holder: s.bankHolder,
            Last_Update: s.updated_at || new Date().toISOString()
        }];

        // KIRIM SEMUA (OVERWRITE TAB)
        await Promise.all([
            fetch(SHEETBEST_URL + '/tabs/Sheet1', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dInv) }),
            fetch(SHEETBEST_URL + '/tabs/Clients', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dCli) }),
            fetch(SHEETBEST_URL + '/tabs/Projects', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dProj) }),
            fetch(SHEETBEST_URL + '/tabs/Payments', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dPay) }),
            fetch(SHEETBEST_URL + '/tabs/Settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dSet) })
        ]);
    }
};