// public/js/trades.js
window.TradesModule = {
    getHTML: function() {
        return `
            <h2 class="text-xl font-bold mb-4 text-green-700"><i class="fas fa-exchange-alt"></i> Área de Trocas</h2>
            
            <div class="flex gap-2 mb-4">
                <button onclick="TradesModule.loadMatches('quero')" class="flex-1 bg-purple-600 text-white p-3 rounded shadow-md font-bold text-sm">Eu Quero (Faltam)</button>
                <button onclick="TradesModule.loadMatches('troco')" class="flex-1 bg-orange-500 text-white p-3 rounded shadow-md font-bold text-sm">Eu Troco (Repetidas)</button>
            </div>

            <div id="trades-list" class="space-y-3 overflow-y-auto h-[60vh] pb-10">
                <p class="text-gray-500 text-center mt-10">Clique em uma opção acima para cruzar os dados com os amigos.</p>
            </div>
        `;
    },

    init: function() {
        if (!window.albumAuth || !window.albumAuth.getUser().id) {
            document.getElementById('main-content').innerHTML = '<p class="text-red-500 mt-5">Faça login para ver as trocas.</p>';
        }
    },

    loadMatches: async function(type) {
        document.getElementById('trades-list').innerHTML = '<p class="text-center text-gray-500"><i class="fas fa-spinner fa-spin"></i> Buscando...</p>';
        try {
            const res = await fetch(`/api/trades/${type}`, {
                headers: { 'Authorization': 'Bearer ' + window.albumAuth.getToken() }
            });
            const matches = await res.json();
            
            if(matches.length === 0) {
                document.getElementById('trades-list').innerHTML = '<p class="text-center text-gray-500 mt-5">Nenhuma combinação encontrada no momento.</p>';
                return;
            }

            let html = '';
            matches.forEach(m => {
                html += `
                    <div class="bg-white p-3 rounded shadow border-l-4 ${type === 'quero' ? 'border-purple-500' : 'border-orange-500'}">
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-bold text-gray-800"><i class="fas fa-user-circle"></i> ${m.usuarioNome}</span>
                            <span class="bg-gray-200 text-xs px-2 py-1 rounded">Fig. ${m.figurinha}</span>
                        </div>
                        <p class="text-xs text-gray-600 mb-2">${type === 'quero' ? 'Ele tem para trocar!' : 'Ele precisa dessa!'}</p>
                        <button onclick="window.albumAuth.openMobileMail('${m.email}', 'Bora trocar figurinhas? Copa 2026', 'Olá ${m.usuarioNome}, vi no app que podemos trocar a figurinha ${m.figurinha}!')" class="w-full bg-green-500 text-white p-2 rounded text-sm hover:bg-green-600 transition-colors">
                            <i class="fas fa-envelope"></i> Enviar e-Mail para Trocar
                        </button>
                    </div>
                `;
            });
            document.getElementById('trades-list').innerHTML = html;
        } catch(err) {
            document.getElementById('trades-list').innerHTML = '<p class="text-red-500 text-center">Erro ao buscar dados.</p>';
        }
    }
};