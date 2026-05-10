// public/js/chat.js
window.ChatModule = {
    getHTML: function() {
        return `
            <div class="flex flex-col h-[70vh]">
                <h2 class="text-xl font-bold mb-4 text-green-700"><i class="fas fa-comments"></i> Chat Geral</h2>
                <div id="chat-messages" class="flex-1 overflow-y-auto mb-4 bg-white p-3 border rounded shadow-inner text-sm space-y-2">
                    <p class="text-gray-500 text-center">Carregando mensagens...</p>
                </div>
                <form id="chat-form" class="flex gap-2">
                    <input type="text" id="chat-input" class="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Digite sua mensagem..." required>
                    <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-5 rounded-lg transition-colors">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </form>
            </div>
        `;
    },

    init: function() {
        const user = window.albumAuth ? window.albumAuth.getUser() : {};
        if (!user.id) {
            document.getElementById('chat-messages').innerHTML = '<p class="text-red-500 text-center mt-5">Faça login para usar o chat.</p>';
            document.getElementById('chat-form').style.display = 'none';
            return;
        }

        this.loadMessages();
        
        document.getElementById('chat-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            const msg = input.value.trim();
            if(!msg) return;

            try {
                await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.albumAuth.getToken() },
                    body: JSON.stringify({ mensagem: msg, userId: user.id, nome: user.nome })
                });
                input.value = '';
                this.loadMessages(); // Recarrega após enviar
            } catch(err) {
                alert('Erro ao enviar mensagem.');
            }
        });
    },

    loadMessages: async function() {
        try {
            const res = await fetch('/api/chat', {
                headers: { 'Authorization': 'Bearer ' + window.albumAuth.getToken() }
            });
            const mensagens = await res.json();
            const container = document.getElementById('chat-messages');
            
            if(mensagens.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-center mt-5">Nenhuma mensagem nas últimas 24h.</p>';
                return;
            }

            container.innerHTML = mensagens.map(m => `
                <div class="p-2 bg-gray-50 rounded">
                    <span class="font-bold text-green-700">${m.Nome}:</span> 
                    <span class="text-gray-700">${m.Mensagem}</span>
                    <div class="text-[10px] text-gray-400 text-right">${m.DataHora}</div>
                </div>
            `).join('');
            container.scrollTop = container.scrollHeight; // Rola para o fim
        } catch(err) {
            console.error(err);
        }
    }
};