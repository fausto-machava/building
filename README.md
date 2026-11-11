# ARQCONS — DO PROJECTO À OBRA

Aplicação de demonstração para uma empresa de arquitectura e engenharia, com website público em React/Vite e API administrativa em Express/MongoDB. Os textos, contactos e dados de demonstração devem ser substituídos pelos dados reais da empresa.

## Requisitos

- Node.js 20 ou superior
- MongoDB local ou uma instância MongoDB Atlas

## Estrutura do projecto

```text
3DApp/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/styles/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/{Home,About,Services,Portfolio,Contact,Admin}/
│   │   ├── features/{clients,requests,projects,quotations,users}/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── routes/
│   │   ├── context/
│   │   └── App.jsx
│   └── package.json
├── Backend/
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── models/
│       ├── routes/
│       ├── middlewares/
│       ├── services/
│       ├── validators/
│       ├── utils/
│       └── app.js
│   ├── uploads/
│   ├── server.js
│   └── package.json
├── package.json
└── README.md
```

- `frontend/src/App.jsx`: composição das páginas e rotas da interface.
- `frontend/src/pages`: áreas de páginas públicas e administrativas.
- `frontend/src/components`: componentes reutilizáveis, organizados por área.
- `frontend/src/features`: módulos funcionais da aplicação.
- `frontend/src/services`: comunicação com a API.
- `frontend/src/assets/styles`: estilos globais e identidade visual.
- `Backend/src/app.js`: configuração da API, middlewares e endpoints.
- `Backend/src/models`: modelos e esquemas MongoDB.
- `Backend/src/scripts`: tarefas executáveis, como a criação inicial do administrador.
- `Backend/server.js`: ligação à base de dados e arranque do servidor.

## Instalação e execução

1. Copie `Backend/.env.example` para `Backend/.env` e configure a ligação MongoDB, o segredo JWT e as credenciais do administrador.
2. Copie `frontend/.env.example` para `frontend/.env` se a API não estiver em `http://localhost:5000/api`.
3. Na raiz, execute `npm install`.
4. Crie o utilizador administrador com `npm run seed:admin`.
5. Carregue o catálogo inicial de serviços com `npm run seed:services`.
6. Inicie a aplicação com `npm run dev`. O website estará em `http://localhost:5173` e a API em `http://localhost:5000`.

O utilizador administrador é criado exclusivamente pelo script de seed; não existe registo público. Defina `CLIENT_ORIGIN` como uma lista separada por vírgulas dos domínios permitidos em produção. Configure Cloudinary para uploads de documentos, plantas e imagens. Os modelos GLB/OBJ até 1 GiB são enviados directamente do navegador para o Cloudflare R2 em partes de 16 MiB, sem atravessar a memória da API. Para ficheiros grandes, prepare localmente um tileset com níveis de detalhe (ver abaixo): o visualizador transfere progressivamente apenas os níveis necessários, sem exigir o download integral do modelo original. O carregamento directo de GLB/OBJ no visualizador permanece limitado a 50 MiB. Para notificações por email configure SMTP. Sem esses serviços configurados, pedidos sem anexos e mensagens são guardados no MongoDB, mas as respectivas integrações externas não são executadas.

### Modelos 3D com streaming e níveis de detalhe

Para evitar que modelos grandes sejam descarregados e descodificados integralmente no navegador, converta-os localmente num tileset 3D. A conversão não envia o modelo a um serviço externo e pode exigir bastante memória e tempo no computador que a executa. O ficheiro de origem deve ter até 1 GiB. A pasta de saída ainda não pode existir:

```powershell
npm run prepare:model:tiles -w platform-backend -- "C:\modelos\edificio.glb" "C:\modelos\edificio-tiles"
```

Também são aceites ficheiros OBJ; mantenha os respectivos ficheiros MTL e texturas na mesma pasta do OBJ. A ferramenta cria `tileset.json` e três níveis GLB (`lod-0.glb`, `lod-1.glb`, `lod-2.glb`). No painel de administração, edite o projecto, seleccione a pasta `edificio-tiles` no campo **Modelo 3D para streaming/LOD** e guarde. Os ficheiros são enviados directamente para o R2; o painel valida o índice e só publica o tileset quando os três níveis estão disponíveis. O limite é 1 GiB por ficheiro e 3 GiB no conjunto. O visualizador selecciona o detalhe conforme a distância e mantém uma cache limitada para reduzir o uso de memória.

### Configuração do Cloudflare R2

1. Crie um bucket R2 e uma chave de API com permissões de leitura e escrita apenas nesse bucket. Configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET_NAME` no ambiente local ou no painel do Render.
2. Active o acesso público de leitura através de um domínio personalizado para o bucket e defina `R2_PUBLIC_URL` como a origem pública, sem barra final (por exemplo, `https://modelos.example.com`). Não use a chave secreta no frontend.
3. Configure CORS no bucket para permitir as origens exactas do frontend, métodos `GET`, `HEAD` e `PUT`, cabeçalhos permitidos `*` e expor o cabeçalho `ETag`. A API usa o `ETag` devolvido pelo navegador para concluir cada upload multipart.
4. No Render, preencha as cinco variáveis `R2_*` marcadas como `sync: false` no Blueprint. Reinicie/reimplante a API depois da configuração.
5. Configure uma regra de ciclo de vida do bucket para abortar uploads multipart incompletos após um dia. As sessões temporárias também expiram na aplicação; essa regra remove as partes que possam permanecer no R2 se o navegador fechar inesperadamente.

Os ficheiros usam partes de 16 MiB, concorrência máxima de quatro pedidos e limite total de 1 GiB. Uma sessão autenticada pode ser abortada pelo navegador quando há falha; um ciclo de vida R2 é necessário para limpar sessões abandonadas por interrupções. Modelos GLB/OBJ são publicados em `R2_PUBLIC_URL` após a conclusão.

## Deploy (Vercel + Render)

O repositório inclui `vercel.json` para publicar o website e `render.yaml` para criar a API. Ambos os serviços usam o lockfile da raiz do monorepo. O Blueprint usa o plano gratuito do Render; serviços gratuitos podem suspender-se quando inactivos. Antes de começar, tenha uma base de dados MongoDB Atlas acessível pelo serviço Render.

1. No Render, crie um **Blueprint** a partir do repositório e use o `render.yaml`. O comando de build instala também as dependências de desenvolvimento necessárias ao Vite antes de compilar o website. Se o serviço já existir, sincronize o Blueprint ou defina o comando de build como `npm ci --include=dev && npm run build`; o comando configurado directamente no painel do serviço pode substituir o do Blueprint. Configure `MONGODB_URI` com a ligação Atlas, `JWT_SECRET` com um segredo aleatório forte (por exemplo, gere um com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) e `CLIENT_ORIGIN` com o domínio exacto do website Vercel. A API remove barras finais e já permite `https://arqcons.vercel.app` em produção; acrescente domínios adicionais separados por vírgulas. O Render fornece automaticamente `PORT`.
2. No Vercel, importe o mesmo repositório e defina o directório raiz como `frontend` (a configuração `frontend/vercel.json` configura a saída SPA). Defina `VITE_API_URL` como o URL público da API Render seguido de `/api` (por exemplo, `https://arqcons-api.onrender.com/api`) e publique.
3. Confirme o domínio de produção atribuído pelo Vercel; se for diferente de `https://arqcons.vercel.app`, actualize `CLIENT_ORIGIN` no Render com esse domínio exacto e aguarde o novo deploy da API. Se houver domínios adicionais, separe-os por vírgulas.
4. Verifique `https://<api-render>/api/health`; a resposta deve indicar `status: "ok"` e `database: "connected"`. Teste também o login, formulários e navegação directa para uma página de projecto.

O seed do administrador não é executado automaticamente no deploy. Se a base Atlas já contém o administrador, não volte a executá-lo. Caso ainda não exista, execute `npm run seed:admin -w platform-backend` uma única vez num ambiente ligado à mesma base Atlas e defina `ADMIN_NAME`, `ADMIN_EMAIL` e uma palavra-passe única com pelo menos 12 caracteres nesse ambiente. Não guarde segredos em ficheiros versionados nem os envie no chat. Configure Cloudinary e SMTP no Render apenas se for usar uploads e notificações por email.

Para a lista de acesso de rede do Atlas, permita o acesso de saída do Render conforme as opções disponíveis no plano; restringir por IP é preferível. Não use uma lista de acesso aberta sem compreender o risco. As variáveis marcadas `sync: false` no Blueprint devem ser preenchidas no painel do Render e nunca devem ser adicionadas ao repositório. Cloudinary, Cloudflare R2 e SMTP são opcionais e podem ser configurados depois no painel do serviço.

## Funcionalidades incluídas

- Website responsivo em português com páginas institucionais, serviços, portfólio, contactos e formulário de orçamento em etapas.
- Páginas individuais de projecto com visualizador 3D interactivo, vistas de planta, exterior e interior, suporte a modelos GLB/OBJ e selecção de compartimentos por grupos nomeados no modelo.
- API REST com autenticação JWT em cookie HttpOnly, papéis de utilizador, limites de tentativas de login, validação, CORS e Helmet.
- Modelos Mongoose para utilizadores, clientes, serviços, projectos, pedidos de orçamento, propostas, notificações e registo de actividade.
- Área administrativa com indicadores reais da API, listagens pesquisáveis e operações de gestão de clientes, pedidos, propostas, projectos e serviços; permite adicionar, editar, publicar e remover projectos e serviços apresentados no website, carregar uma imagem de capa ou indicar o seu URL e pré-visualizar o projecto com o seu modelo 3D.
- Upload validado de documentos e imagens para Cloudinary; upload multipart directo para R2 de modelos 3D até 1 GB; notificações SMTP opcionais e geração de PDF de propostas.

## Limites do protótipo

Os textos, contactos, projectos de exemplo e imagens são conteúdo ilustrativo. O visualizador apresenta uma casa demonstrativa quando um projecto não tem um modelo 3D carregado. Para carregar um projecto real, configure Cloudflare R2 e Cloudinary, crie o projecto no painel e seleccione um ficheiro `.glb` ou `.obj` de até 1 GB e, opcionalmente, uma planta JPG/PNG/WebP; carregue até 20 imagens para a galeria do imóvel (máx. 10 MB cada) e publique-o no portfólio. Os ficheiros OBJ devem conter geometria válida e usar grupos/objectos com nomes para que os compartimentos possam ser identificados e seleccionados individualmente; sem grupos nomeados, o modelo continua visível sem o selector. Os modelos devem incluir uma vista em corte ou os espaços internos expostos para que o modo interior seja visível; o modo de planta oferece uma vista superior 3D do modelo. O limite de upload não garante uma experiência fluida com modelos de 500 MB: optimize e comprima a geometria, texturas e níveis de detalhe para reduzir o consumo de rede, memória e GPU. Antes de produção, configure os serviços externos e o domínio, substitua os dados de demonstração e reveja os fluxos de aprovação, políticas de privacidade, backups e permissões de utilizadores. O painel fornece CRUD básico, não inclui ainda gestão completa de utilizadores nem edição de propostas com linhas detalhadas.
