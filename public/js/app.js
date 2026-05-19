// public/js/app.js (trecho do case 'auth')
case 'auth':
    content = `
        <div class="space-y-8">
            <section class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <h2 class="text-xl font-bold mb-4 text-green-700">Entrar</h2>
                <div id="login-message" class="mb-2 text-sm"></div>
                <form id="form-login" class="flex flex-col gap-3">
                    <input type="text" id="login-id" placeholder="ID ou eMail" class="p-3 border rounded" required>
                    <input type="password" id="login-senha" placeholder="Senha" class="p-3 border rounded" maxlength="6" required>
                    <button type="submit" class="bg-green-600 text-white p-3 rounded-lg font-bold">Entrar</button>
                </form>
            </section>
            <section class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <h2 class="text-lg font-bold mb-4 text-gray-700">Criar Conta</h2>
                <div id="auth-message" class="mb-2 text-sm"></div>
                <form id="form-register" class="flex flex-col gap-3">
                    <input type="text" id="reg-nome" placeholder="Nome Completo" class="p-3 border rounded" required>
                    <input type="email" id="reg-email" placeholder="eMail" class="p-3 border rounded" required>
                    <input type="password" id="reg-senha" placeholder="Senha (6 dígitos)" class="p-3 border rounded" maxlength="6" required>
                    <button type="submit" class="bg-gray-500 text-white p-3 rounded-lg font-bold">Cadastrar</button>
                </form>
            </section>
        </div>`;
    this.mainContent.innerHTML = content;
    if (window.albumAuth) window.albumAuth.init(); // Ativa os formulários
    break;