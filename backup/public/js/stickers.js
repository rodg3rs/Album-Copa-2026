// public/js/stickers.js
window.StickersModule = {
    currentType: 'album', // 'album' ou 'repetidas'

    getHTML: function() {
        return `
            <h2 class="text-xl font-bold mb-4 text-green-700"><i class="fas fa-book"></i> Minhas Figurinhas</h2>
            
            <div class="flex gap-2 mb-4">
                <button onclick="StickersModule.switchTab('album')" id="tab-album" class="flex-1 bg-blue-600 text-white p-2 rounded shadow-md font-semibold">Meu Álbum</button>
                <button onclick="StickersModule.switchTab('repetidas')" id="tab-repetidas" class="flex-1 bg-gray-300 text-gray-700 p-2 rounded shadow-md font-semibold">Minhas Repetidas</button>
            </div>

            <p class="text-sm text-gray-600 mb-2" id="stickers-desc">Marque as figurinhas que você <b>já colou</b> no álbum:</p>
            
            <div id="stickers-grid" class="grid grid-cols-5 gap-2 h-[50vh] overflow-y-auto p-1">
                </div>

            <button onclick="StickersModule.save()" class="w-full bg-green-600 hover:bg-green-700 text-white p-3 rounded-lg mt-4 font-bold shadow-md transition-colors">
                <i class="fas fa-save"></i> Atualizar
            </button>
        `;
    },

    init: async function() {
        if (!window.albumAuth || !window.albumAuth.getUser().id) {
            document.getElementById('main-content').innerHTML = '<p class="text-red-500 mt-5">Faça login para gerenciar figurinhas.</p>';
            return;
        }
        this.renderGrid();
        this.switchTab('album');
    },

    renderGrid: function() {
        let gridHTML = '';
        for(let i = 1; i <= 200; i++) {
            gridHTML += `
                <label class="flex flex-col items-center justify-center p-2 border border-gray-300 rounded cursor-pointer hover:bg-green-50 transition-colors">
                    <input type="checkbox" id="stk-${i}" value="${i}" class="mb-1 w-4 h-4 text-green-600 rounded focus:ring-green-500">
                    <span class="text-xs font-bold text-gray-700">${i}</span>
                </label>
            `;
        }
        document.getElementById('stickers-grid').innerHTML = gridHTML;
    },

    switchTab: async function(type) {
        this.currentType = type;
        document.getElementById('tab-album').className = type === 'album' ? 'flex-1 bg-blue-600 text-white p-2 rounded shadow-md font-semibold' : 'flex-1 bg-gray-300 text-gray-700 p-2 rounded shadow-md font-semibold';
        document.getElementById('tab-repetidas').className = type === 'repetidas' ? 'flex-1 bg-yellow-500 text-white p-2 rounded shadow-md font-semibold' : 'flex-1 bg-gray-300 text-gray-700 p-2 rounded shadow-md font-semibold';
        document.getElementById('stickers-desc').innerHTML = type === 'album' ? 'Marque as figurinhas que você <b>já colou</b>:' : 'Marque as figurinhas que você <b>tem repetidas</b>:';

        // Resetar grid
        for(let i=1; i<=200; i++) document.getElementById(`stk-${i}`).checked = false;

        // Buscar do backend
        try {
            const res = await fetch(`/api/stickers/${type}`, { headers: { 'Authorization': 'Bearer ' + window.albumAuth.getToken() } });
            const data = await res.json();
            if(data.figurinhas) {
                const arr = JSON.parse(data.figurinhas); // Array com os números
                arr.forEach(num => {
                    const chk = document.getElementById(`stk-${num}`);
                    if(chk) chk.checked = true;
                });
            }
        } catch(err) { console.error('Erro ao buscar figurinhas', err); }
    },

    save: async function() {
        const marcadas = [];
        for(let i=1; i<=200; i++) {
            if(document.getElementById(`stk-${i}`).checked) marcadas.push(i);
        }

        try {
            await fetch(`/api/stickers/${this.currentType}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.albumAuth.getToken() },
                body: JSON.stringify({ figurinhas: JSON.stringify(marcadas) })
            });
            alert('Atualizado com sucesso!');
            app.loadModule('main'); // Volta pro menu (definido no app.js atualizado)
        } catch(err) {
            alert('Erro ao salvar.');
        }
    }
};