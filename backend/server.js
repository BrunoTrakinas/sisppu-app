// Importa as bibliotecas
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');

// Inicializa o servidor
const app = express();
app.use(cors());

// --- FUNÇÕES DE AUTENTICAÇÃO (sem alterações) ---
async function getAuthClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    });
    const client = await auth.getClient();
    return client;
}

async function getGoogleSheets(authClient) {
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    return sheets;
}

// --- FUNÇÃO AUXILIAR PARA LER E FORMATAR DADOS DE UMA ABA ---
async function readSheetData(sheets, spreadsheetId, range) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }

        const headers = rows[0];
        const data = rows.slice(1).filter(row => row.some(cell => cell !== '')).map(row => {
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = row[index] || '';
            });
            return rowData;
        });

        return data;
    } catch (error) {
        console.error(`Erro ao ler a aba "${range}":`, error.message);
        return [];
    }
}


// --- ENDPOINT PRINCIPAL QUE AGORA BUSCA DADOS DE TODAS AS ABAS ---
app.get('/all-data', async (req, res) => {
    try {
        const spreadsheetId = '1km_Pjsd4lCpWDZUWijBQIGmQJT-vXMZO-22L0ARtNfc';
        const authClient = await getAuthClient();
        const sheets = await getGoogleSheets(authClient);

        // Adicionamos a nova aba 'Login' à lista
        const sheetNames = [
            'Plano de Execução', 'Inventário PPU', 'Inventário Centro',
            'Receita Inspeções', 'Receita Trocas',
            'PD Comprado', 'PD Gerado',
            'Price List', 'Lisde',
            'Politica de Estoque de Inspeções', 'Demandas de PIM',
            'Controle de Entrada', 'Ordens de Serviço',
            'Login' // <-- NOVA ABA
        ];

        const promises = sheetNames.map(name => readSheetData(sheets, spreadsheetId, name));
        const results = await Promise.all(promises);

        const rawData = {};
        sheetNames.forEach((name, index) => {
            rawData[name] = results[index];
        });

        // --- LÓGICA DE CONSOLIDAÇÃO ---
        const receitasDeTarefas = [
            ...rawData['Receita Inspeções'].map(item => ({ ...item, 'Nome da Tarefa': item.NOME_INSPECAO })),
            ...rawData['Receita Trocas'].map(item => ({ ...item, 'Nome da Tarefa': item.NOME_TROCA }))
        ];

        const pedidosDeCompraPDs = [
            ...rawData['PD Comprado'].map(pd => ({ ...pd, Status: 'Pago' })),
            ...rawData['PD Gerado'].map(pd => ({ ...pd, Status: 'Gerado' }))
        ];

        // Monta o objeto de resposta final para o front-end
        const allData = {
            planoDeExecução: rawData['Plano de Execução'],
            inventárioPPU: rawData['Inventário PPU'],
            inventárioCentro: rawData['Inventário Centro'],
            priceList: rawData['Price List'],
            lisde: rawData['Lisde'],
            politicaDeEstoqueDeInspeções: rawData['Politica de Estoque de Inspeções'],
            demandasDePIM: rawData['Demandas de PIM'],
            controleDeEntrada: rawData['Controle de Entrada'],
            ordensDeServiço: rawData['Ordens de Serviço'],
            logins: rawData['Login'], // <-- ENVIA OS DADOS DE LOGIN
            receitasDeTarefas: receitasDeTarefas,
            pedidosDeCompraPDs: pedidosDeCompraPDs,
        };

        res.json(allData);

    } catch (error) {
        console.error('Erro geral ao processar os dados:', error);
        res.status(500).send('Erro no servidor ao tentar buscar os dados da planilha.');
    }
});


// Define a porta e inicia o servidor
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});