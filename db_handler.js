// ==========================================
// SMART SYNC ENGINE (WHATSAPP STYLE)
// ==========================================
const SHEETBEST_URL = 'https://api.sheetbest.com/sheets/dfdd73c7-8607-45af-a9a2-cec54ba4bdc6';
const DB_KEY = 'MIJ_ERP_v2';

// Struktur Standar
const defaultDB = { invoices: [], clients: [], projects: [], payments: [], leads: [], settings: {} };

window.MIJ_DB = {
    init: function() {
        if (!localStorage.getItem(DB_KEY)) localStorage.setItem(DB_KEY, JSON.stringify(defaultDB));
    },

    getAllData: function() {
        return JSON.parse(localStorage.getItem(DB_KEY) || JSON.stringify(defaultDB));
    },

    saveData: function(newData) {
        localStorage.setItem(DB_KEY, JSON.stringify(newData));
    },

    // --- FUNGSI SMART SYNC (1 TOMBOL) ---
    manualSyncToCloud: async function() {
        // Tampilkan Loading
        Swal.fire({ title: 'Smart Sync...', text: 'Menggabungkan data terbaru...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            // 1. AMBIL DATA DARI CLOUD (SHEET)
            const [resInv, resCli, resProj, resPay, resSet] = await Promise.all([
                fetch(SHEETBEST_URL + '/0'), fetch(SHEETBEST_URL + '/tabs/Clients'),
                fetch(SHEETBEST_URL + '/tabs/Projects'), fetch(SHEETBEST_URL + '/tabs/Payments'),
                fetch(SHEETBEST_URL + '/tabs/Settings')
            ]);

            const cloudData = {
                invoices: await resInv.json(),
                clients: await resCli.json(),
                projects: await resProj.json(),
                payments: await resPay.json(),
                settings: await resSet.json()
            };

            // 2. AMBIL DATA LOKAL (HP)
            const localData = this.getAllData();

            // 3. PROSES MERGING (PENGGABUNGAN CERDAS)
            const mergedDB = {
                invoices: this.mergeArrays(localData.invoices, cloudData.invoices, 'no'), // Pakai NO Invoice sebagai ID
                clients: this.mergeArrays(localData.clients, cloudData.clients, 'id'),
                projects: this.mergeArrays(localData.projects, cloudData.projects, 'id'),
                payments: this.mergeArrays(localData.payments, cloudData.payments, 'id'),
                leads: this.mergeArrays(localData.leads, [], 'id'), // Leads blm ada di sheet, keep local
                settings: this.mergeSettings(localData.settings, cloudData.settings)
            };

            // 4. SIMPAN HASIL GABUNGAN KE HP (LOKAL)
            this.saveData(mergedDB);

            // 5. KIRIM BALIK HASIL GABUNGAN KE CLOUD (Supaya HP lain kebagian update)
            await this.pushToCloud(mergedDB);

            Swal.fire({ icon: 'success', title: 'Sinkronisasi Selesai!', text: 'Data sudah identik di semua perangkat.', timer: 2000, showConfirmButton: false }).then(() => parent.location.reload());

        } catch (error) {
            console.error(error);
            Swal.fire('Gagal Sync', 'Cek koneksi internet.', 'error');
        }
    },

    // --- LOGIKA "YANG TERBARU MENANG" ---
    mergeArrays: function(localArr, cloudArr, keyField) {
        const map = new Map();

        // 1. Masukkan Data Cloud ke Map
        cloudArr.forEach(row => {
            // Konversi dari format Sheet ke format App (Restore)
            let item = this.restoreFormat(row, keyField); 
            map.set(String(item[keyField] || item.id), item);
        });

        // 2. Bandingkan dengan Data Lokal
        localArr.forEach(localItem => {
            const id = String(localItem[keyField] || localItem.id);
            const cloudItem = map.get(id);

            if (!cloudItem) {
                // Jika di cloud tidak ada, berarti ini data baru dari HP -> Masukkan
                map.set(id, localItem);
            } else {
                // KONFLIK: Di HP ada, Di Cloud ada. Siapa menang?
                // Cek Timestamp (updated_at). Default ke 0 jika gak ada.
                const localTime = new Date(localItem.updated_at || 0).getTime();
                const cloudTime = new Date(cloudItem.updated_at || 0).getTime();

                if (localTime > cloudTime) {
                    map.set(id, localItem); // HP lebih baru -> HP Menang
                } else {
                    map.set(id, cloudItem); // Cloud lebih baru -> Cloud Menang
                }
            }
        });

        // 3. Kembalikan array (Hanya yang BELUM DIHAPUS / deleted != true)
        // Tapi kita tetap simpan 'deleted' di database agar device lain tau itu dihapus
        return Array.from(map.values());
    },

    mergeSettings: function(local, cloudRaw) {
        // Settings cuma 1 baris, logika simpel
        let cloudSet = {};
        if (cloudRaw && cloudRaw.length > 0) {
            const s = cloudRaw[0];
            cloudSet = {
                companyName: s.Company_Name, tagline: s.Tagline, address: s.Address,
                email: s.Email, phone: s.Phone, bankName: s.Bank_Name, bankAccount: s.Bank_Acc, bankHolder: s.Bank_Holder,
                updated_at: s.Last_Update
            };
        }
        
        const localTime = new Date(local.updated_at || 0).getTime();
        const cloudTime = new Date(cloudSet.updated_at || 0).getTime();
        
        return localTime > cloudTime ? local : (cloudSet.updated_at ? cloudSet : local);
    },

    // --- HELPER: FORMAT DATA ---
    restoreFormat: function(row, type) {
        // Fungsi ini mengubah kolom Google Sheet kembali jadi Object App
        // Sambil menjaga properti 'updated_at' dan 'deleted'
        let base = { updated_at: row.Last_Update || 0, deleted: row.Is_Deleted === 'TRUE' };
        
        if (row.No_Invoice) { // Invoice
            return { ...base, id: Date.now(), no: row.No_Invoice, clientName: row.Klien, date: row.Tanggal, grandTotal: Number(row.Total), status: row.Status, paidAmount: Number(row.Dibayar), items: [{desc:'Data from Cloud', qty:1, price:Number(row.Total)}] };
        } else if (row.Perusahaan || row.Perusahaan === '-') { // Client
            return { ...base, id: Number(row.ID), name: row.Nama, company: row.Perusahaan, email: row.Email, phone: row.Telepon, type: row.Perusahaan !== '-' ? 'Perusahaan' : 'Individu' };
        } else if (row.Nama_Proyek) { // Project
            return { ...base, id: Number(row.ID), name: row.Nama_Proyek, clientName: row.Klien, progress: Number(row.Progress), kanbanStatus: row.Status, deadline: row.Update };
        } else if (row.ID_Transaksi) { // Payment
            return { ...base, id: Number(row.ID_Transaksi), date: row.Tanggal, invoiceNo: row.No_Invoice, amount: Number(row.Jumlah), method: row.Metode };
        }
        return row; // Fallback
    },

    pushToCloud: async function(db) {
        // Format Data untuk Sheet (Tambah Kolom Last_Update & Is_Deleted)
        const prep = (arr, mapper) => arr.map(item => ({ ...mapper(item), Last_Update: item.updated_at || new Date().toISOString(), Is_Deleted: item.deleted ? 'TRUE' : 'FALSE' }));

        const dInv = prep(db.invoices, i => ({ No_Invoice: i.no, Tanggal: i.date, Klien: i.clientName, Total: i.grandTotal, Status: i.status, Dibayar: i.paidAmount||0 }));
        const dCli = prep(db.clients, c => ({ ID: c.id, Nama: c.name, Perusahaan: c.company, Email: c.email, Telepon: c.phone }));
        const dProj = prep(db.projects, p => ({ ID: p.id, Nama_Proyek: p.name, Klien: p.clientName, Progress: p.progress, Status: p.kanbanStatus, Update: p.deadline }));
        const dPay = prep(db.payments, p => ({ ID_Transaksi: p.id, Tanggal: p.date, No_Invoice: p.invoiceNo, Jumlah: p.amount, Metode: p.method }));
        
        const s = db.settings || {};
        const dSet = [{ 
            Company_Name: s.companyName, Tagline: s.tagline, Address: s.address, Email: s.email, Phone: s.phone, 
            Bank_Name: s.bankName, Bank_Acc: s.bankAccount, Bank_Holder: s.bankHolder, 
            Last_Update: s.updated_at || new Date().toISOString() 
        }];

        await Promise.all([
            fetch(SHEETBEST_URL + '/0', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dInv) }),
            fetch(SHEETBEST_URL + '/tabs/Clients', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dCli) }),
            fetch(SHEETBEST_URL + '/tabs/Projects', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dProj) }),
            fetch(SHEETBEST_URL + '/tabs/Payments', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dPay) }),
            fetch(SHEETBEST_URL + '/tabs/Settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(dSet) })
        ]);
    }
};