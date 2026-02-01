// ==========================================
// KONEKSI SUPABASE (ID FIX: REMOVE NULL)
// ==========================================

const SUPABASE_URL = 'https://lqrpulvscxzxtdwhvsit.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxcnB1bHZzY3h6eHRkd2h2c2l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDI0OTksImV4cCI6MjA4NTUxODQ5OX0.cMBQ55Uxqzs_G3uy_aF7GZTvHovfQAhyjG82nee4b7k';

let dbClient; 
if (typeof window.supabase === 'undefined') {
    alert("FATAL: Script Supabase belum dipasang di index.html!");
} else {
    dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

const DB_KEY = 'MIJ_ERP_v2';
const defaultDB = { invoices: [], clients: [], projects: [], payments: [], leads: [], settings: {} };

window.MIJ_DB = {
    init: function() {
        if (!localStorage.getItem(DB_KEY)) localStorage.setItem(DB_KEY, JSON.stringify(defaultDB));
        console.log("DB Handler Ready ✅");
    },

    getAllData: function() {
        return JSON.parse(localStorage.getItem(DB_KEY) || JSON.stringify(defaultDB));
    },

    saveData: function(newData) {
        localStorage.setItem(DB_KEY, JSON.stringify(newData));
    },

    manualSyncToCloud: async function() {
        Swal.fire({ title: 'Proses Sync...', text: 'Mengirim data ke Supabase...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            // 1. TEST KONEKSI
            const { error: pingError } = await dbClient.from('settings').select('count').limit(1);
            if (pingError) throw new Error("Koneksi Server Gagal: " + pingError.message);

            const local = this.getAllData();

            // --- FUNGSI PEMBERSIH ID (SOLUSI ERROR NULL) ---
            // Jika ID besar (lokal), hapus key 'id' agar Supabase auto-increment.
            // Jika ID kecil (server), biarkan untuk update.
            const clean = (obj) => {
                let newObj = { ...obj }; // Copy object
                if (newObj.id > 1000000000) {
                    delete newObj.id; // HAPUS TOTAL KEY ID
                }
                return newObj;
            };

            // 2. UPLOAD DATA
            
            // Clients
            if (local.clients.length > 0) {
                const payload = local.clients.map(c => clean({
                    id: c.id, name: c.name, company: c.company, email: c.email, phone: c.phone, type: c.type, deleted: c.deleted || false
                }));
                const { error } = await dbClient.from('clients').upsert(payload, { onConflict: 'id' });
                if(error) throw new Error("Upload Client Gagal: " + error.message);
            }

            // Invoices
            if (local.invoices.length > 0) {
                const payload = local.invoices.map(i => clean({
                    id: i.id, no: i.no, client_name: i.clientName, date: i.date, due_date: i.dueDate, 
                    notes: i.notes, items: i.items, tax: i.tax, grand_total: i.grandTotal, 
                    paid_amount: i.paidAmount, status: i.status, deleted: i.deleted || false
                }));
                 const { error } = await dbClient.from('invoices').upsert(payload, { onConflict: 'id' });
                if(error) throw new Error("Upload Invoice Gagal: " + error.message);
            }

            // Projects
            if (local.projects.length > 0) {
                const payload = local.projects.map(p => clean({
                    id: p.id, name: p.name, client_name: p.clientName, value: p.value, deadline: p.deadline,
                    priority: p.priority, progress: p.progress, kanban_status: p.kanbanStatus, deleted: p.deleted || false
                }));
                const { error } = await dbClient.from('projects').upsert(payload, { onConflict: 'id' });
                if(error) throw new Error("Upload Project Gagal: " + error.message);
            }

            // Payments
            if (local.payments.length > 0) {
                const payload = local.payments.map(p => clean({
                    id: p.id, 
                    // Perbaiki Relasi: Jika invoice_id lokal (besar), set null dulu biar gak error foreign key
                    invoice_id: (p.invoiceId > 1000000000 ? null : p.invoiceId),
                    invoice_no: p.invoiceNo, client_name: p.clientName, amount: p.amount, 
                    method: p.method, date: p.date, deleted: p.deleted || false
                }));
                const { error } = await dbClient.from('payments').upsert(payload, { onConflict: 'id' });
                if(error) throw new Error("Upload Payment Gagal: " + error.message);
            }

            // Settings
            if (local.settings.companyName) {
                const s = local.settings;
                await dbClient.from('settings').upsert({
                    id: 1, company_name: s.companyName, tagline: s.tagline, address: s.address,
                    email: s.email, phone: s.phone, bank_name: s.bankName, bank_acc: s.bankAccount, bank_holder: s.bankHolder
                });
            }

            // 3. DOWNLOAD DATA
            const { data: dbClients } = await dbClient.from('clients').select('*');
            const { data: dbInvoices } = await dbClient.from('invoices').select('*');
            const { data: dbProjects } = await dbClient.from('projects').select('*');
            const { data: dbPayments } = await dbClient.from('payments').select('*');
            const { data: dbSettings } = await dbClient.from('settings').select('*').single();

            const newLocal = {
                clients: (dbClients||[]).map(c => ({ id: c.id, name: c.name, company: c.company, email: c.email, phone: c.phone, type: c.type, deleted: c.deleted })),
                invoices: (dbInvoices||[]).map(i => ({ id: i.id, no: i.no, clientName: i.client_name, date: i.date, dueDate: i.due_date, notes: i.notes, items: i.items, tax: i.tax, grandTotal: i.grand_total, paidAmount: i.paid_amount, status: i.status, deleted: i.deleted })),
                projects: (dbProjects||[]).map(p => ({ id: p.id, name: p.name, clientName: p.client_name, value: p.value, deadline: p.deadline, priority: p.priority, progress: p.progress, kanbanStatus: p.kanban_status, deleted: p.deleted })),
                payments: (dbPayments||[]).map(p => ({ id: p.id, invoiceId: p.invoice_id, invoiceNo: p.invoice_no, clientName: p.client_name, amount: p.amount, method: p.method, date: p.date, deleted: p.deleted })),
                settings: dbSettings ? { companyName: dbSettings.company_name, tagline: dbSettings.tagline, address: dbSettings.address, email: dbSettings.email, phone: dbSettings.phone, bankName: dbSettings.bank_name, bankAccount: dbSettings.bank_acc, bankHolder: dbSettings.bank_holder } : {},
                leads: local.leads || []
            };

            this.saveData(newLocal);
            
            Swal.fire({
                icon: 'success', title: 'BERHASIL! 🎉', text: 'Data sudah masuk Supabase.',
                timer: 2000, showConfirmButton: false
            }).then(() => parent.location.reload());

        } catch (error) {
            console.error('SYNC ERROR:', error);
            Swal.fire({
                icon: 'error', title: 'Gagal Sync',
                html: `<span style="color:red">${error.message}</span>`
            });
        }
    }
};