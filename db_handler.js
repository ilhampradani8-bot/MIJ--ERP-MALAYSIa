// === MIJ ERP - DATABASE HANDLER & SYNC ===
const DB_KEY = 'MIJ_ERP_v2';
// URL Sheet.best kamu (Sesuai file yang kamu upload)
// Konfigurasi Koneksi Database (Sheet.best)
// Pastikan ini URL baru dari akun perusahaan
const SHEETBEST_URL = 'https://api.sheetbest.com/sheets/dfdd73c7-8607-45af-a9a2-cec54ba4bdc6';

// ========== 1. FUNGSI DATABASE LOKAL (CORE) ==========

// Fungsi inisialisasi awal database jika kosong
function initDatabase() {
    if (!localStorage.getItem(DB_KEY)) {
        const initialData = {
            version: '2.0',
            lastSync: new Date().toISOString(),
            lastCloudSync: null,
            settings: {
                companyName: 'MIJ DIGITAL MALAYSIA',
                taxRate: 6,
                currency: 'MYR',
                bankAccount: 'Maybank 112233445566'
            },
            clients: [],
            invoices: [],
            projects: [],
            leads: [],
            payments: []
        };
        saveData(initialData);
    }
}

// Ambil semua data
function getAllData() {
    // Cek apakah dipanggil dari iframe, jika ya, coba ambil dari parent dulu untuk konsistensi
    if (window.parent && window.parent.MIJ_DB && window.parent !== window) {
        // Opsi: return window.parent.getAllData(); 
        // Tapi untuk aman, kita baca langsung localStorage karena localStorage dibagi antar domain yg sama
    }
    
    const data = localStorage.getItem(DB_KEY);
    if (!data) {
        initDatabase();
        return JSON.parse(localStorage.getItem(DB_KEY));
    }
    return JSON.parse(data);
}

// Simpan data
function saveData(data) {
    data.lastSync = new Date().toISOString();
    localStorage.setItem(DB_KEY, JSON.stringify(data));
    
    // Update tampilan statistik di dashboard/header jika fungsi updateDBStats tersedia
    if (typeof updateDBStats === 'function') {
        updateDBStats();
    } else if (window.parent && typeof window.parent.updateDBStats === 'function') {
        window.parent.updateDBStats();
    }
    
    return data;
}

// ========== 2. FUNGSI SYNC KE GOOGLE SHEETS (SHEET.BEST) ==========

const MIJ_DB = {
    // Wrapper agar bisa dipanggil via MIJ_DB.getAllData()
    getAllData: getAllData,
    saveData: saveData,
    initDatabase: initDatabase,

    // Fungsi Sync Utama
    
// GANTI BAGIAN "manualSyncToCloud" DENGAN INI:
    
// === VERSI ULTIMATE: SYNC 4 TAB (Invoice, Clients, Projects, Payments) ===
    async manualSyncToCloud() {
        const data = getAllData();
        
        // Ambil semua data
        const invoices = data.invoices || [];
        const clients = data.clients || [];
        const projects = data.projects || [];
        const payments = data.payments || [];

        // Cek jika kosong melompong
        if (!invoices.length && !clients.length && !projects.length && !payments.length) {
            alert('Semua data masih kosong. Tidak ada yang perlu di-sync.');
            return;
        }

        showSyncProgress('Menghubungkan ke Google Sheets...', 10);

        try {
            // --- PART 1: INVOICE (Tab Utama) ---
            if (invoices.length > 0) {
                updateSyncProgress('Upload Invoice...', 25);
                const invData = invoices.map(inv => ({
                    No_Invoice: inv.no,
                    Tanggal: inv.date,
                    Klien: inv.clientName,
                    Total: inv.grandTotal,
                    Status: inv.status,
                    Dibayar: inv.paidAmount,
                    Sisa: (inv.grandTotal - inv.paidAmount),
                    Update_Terakhir: new Date().toISOString()
                }));
                
                let res = await fetch(SHEETBEST_URL, { // URL Default = Tab 1
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(invData)
                });
                if (!res.ok) throw new Error("Gagal Invoice: " + await res.text());
            }

            // --- PART 2: CLIENTS ---
            if (clients.length > 0) {
                updateSyncProgress('Upload Data Klien...', 50);
                const cliData = clients.map(cl => ({
                    ID: cl.id,
                    Nama: cl.name,
                    Perusahaan: cl.company,
                    Email: cl.email,
                    Telepon: cl.phone
                }));

                let res = await fetch(SHEETBEST_URL + '/tabs/Clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cliData)
                });
                if (!res.ok) throw new Error("Gagal Klien: " + await res.text());
            }

            // --- PART 3: PROJECTS ---
            if (projects.length > 0) {
                updateSyncProgress('Upload Proyek...', 75);
                const projData = projects.map(p => ({
                    ID: p.id,
                    Nama_Proyek: p.name,
                    Klien: p.clientName,
                    Progress: p.progress + '%',
                    Status: p.status,
                    Update: new Date().toISOString()
                }));

                let res = await fetch(SHEETBEST_URL + '/tabs/Projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(projData)
                });
                if (!res.ok) throw new Error("Gagal Proyek: " + await res.text());
            }

            // --- PART 4: PAYMENTS (Keuangan) ---
            if (payments.length > 0) {
                updateSyncProgress('Upload Riwayat Bayar...', 90);
                const payData = payments.map(pay => ({
                    Tanggal: pay.date,
                    No_Invoice: pay.invoiceNo,
                    Jumlah: pay.amount,
                    Metode: pay.method,
                    ID_Transaksi: pay.id
                }));

                let res = await fetch(SHEETBEST_URL + '/tabs/Payments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payData)
                });
                if (!res.ok) throw new Error("Gagal Payment: " + await res.text());
            }

            // --- SELESAI ---
            updateSyncProgress('Selesai!', 100);
            
            data.lastCloudSync = new Date().toISOString();
            saveData(data); // Simpan timestamp sync di lokal

            setTimeout(() => {
                hideSyncProgress();
                alert(`✅ BACKUP LENGKAP SUKSES!\nSemua data (Inv, Client, Proyek, Payment) aman di Google Sheets.`);
            }, 500);

        } catch (error) {
            console.error(error);
            hideSyncProgress();
            alert('❌ Sync Terputus:\n' + error.message);
        }
    },
    

    // Fungsi Load (Download) dari Cloud (Opsional/Advance)
    async loadFromCloud() {
        if(!confirm("Fitur ini akan menimpa data lokal dengan data dari Google Sheets. Yakin?")) return;
        
        try {
            showSyncProgress('Mengunduh data...', 30);
            const response = await fetch(SHEETBEST_URL);
            const cloudData = await response.json();
            
            // Disini logika parsing dari Sheets kembali ke format Database App perlu dibuat
            // Karena format di Sheets sudah 'flat', agak rumit mengembalikannya ke struktur 'complex'.
            // Untuk sekarang kita hanya alert sukses koneksi saja.
            
            updateSyncProgress('Selesai...', 100);
            setTimeout(() => {
                hideSyncProgress();
                alert(`Data berhasil ditarik! (Ditemukan ${cloudData.length} baris). Logika restore belum diaktifkan demi keamanan data.`);
            }, 500);

        } catch (error) {
            hideSyncProgress();
            alert('Gagal Load: ' + error.message);
        }
    }
};

// ========== 3. UTILITIES (UI PROGRESS BAR) ==========

function showSyncProgress(msg, percent) {
    let el = document.getElementById('syncOverlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'syncOverlay';
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;font-family:sans-serif;';
        el.innerHTML = `<h3 id="syncMsg">${msg}</h3><div style="width:300px;height:10px;background:#333;border-radius:5px;margin-top:10px;"><div id="syncBar" style="width:${percent}%;height:100%;background:#4ade80;border-radius:5px;transition:0.3s;"></div></div>`;
        document.body.appendChild(el);
    } else {
        document.getElementById('syncMsg').innerText = msg;
        document.getElementById('syncBar').style.width = percent + '%';
    }
}

function updateSyncProgress(msg, percent) {
    showSyncProgress(msg, percent);
}

function hideSyncProgress() {
    const el = document.getElementById('syncOverlay');
    if (el) el.remove();
}

// ========== 4. GLOBAL EXPOSE ==========
// Agar bisa diakses dari file HTML manapun
window.MIJ_DB = MIJ_DB;
window.getAllData = getAllData;
window.saveData = saveData;
window.initDatabase = initDatabase;

// Auto init saat file dimuat
initDatabase();