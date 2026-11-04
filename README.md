# Traço — Arquitectura & Engenharia

Aplicação de demonstração para uma empresa de arquitectura e engenharia, com website público em React/Vite e API administrativa em Express/MongoDB. O conteúdo e a identidade "Traço" são exemplos de trabalho e devem ser substituídos pelos dados reais da empresa.

## Requisitos

- Node.js 20 ou superior
- MongoDB local ou uma instância MongoDB Atlas

## Estrutura do projecto

```text
3DApp/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── admin/
│   │   ├── pages/
│   │   ├── services/
│   │   └── styles/
│   └── ...
├── backend/
│   └── src/
│       ├── models/
│       └── scripts/
├── package.json
└── README.md
```

- `frontend/src/pages`: páginas e composição das rotas da interface.
- `frontend/src/components`: componentes reutilizáveis, organizados por área.
- `frontend/src/services`: comunicação com a API.
- `frontend/src/styles`: estilos globais e identidade visual.
- `backend/src/app.js`: configuração da API e dos endpoints.
- `backend/src/models`: modelos e esquemas MongoDB.
- `backend/src/scripts`: tarefas executáveis, como a criação inicial do administrador.

## Instalação e execução

1. Copie `backend/.env.example` para `backend/.env` e configure a ligação MongoDB, o segredo JWT e as credenciais do administrador.
2. Copie `frontend/.env.example` para `frontend/.env` se a API não estiver em `http://localhost:5000/api`.
3. Na raiz, execute `npm install`.
4. Crie o utilizador administrador com `npm run seed:admin`.
5. Inicie a aplicação com `npm run dev`. O website estará em `http://localhost:5173` e a API em `http://localhost:5000`.

O utilizador administrador é criado exclusivamente pelo script de seed; não existe registo público. Defina `CLIENT_ORIGIN` como uma lista separada por vírgulas dos domínios permitidos em produção. Para uploads de documentos configure as credenciais Cloudinary; para notificações por email configure SMTP. Sem esses serviços configurados, pedidos sem anexos e mensagens são guardados no MongoDB, mas as respectivas integrações externas não são executadas.

## Deploy (Vercel + Render)

O repositório inclui `vercel.json` para publicar o website e `render.yaml` para criar a API. Ambos os serviços usam o lockfile da raiz do monorepo. O Blueprint usa o plano gratuito do Render; serviços gratuitos podem suspender-se quando inactivos. Antes de começar, tenha uma base de dados MongoDB Atlas acessível pelo serviço Render.

1. No Render, crie um **Blueprint** a partir do repositório e use o `render.yaml`. Configure `MONGODB_URI` com a ligação Atlas, `JWT_SECRET` com um segredo aleatório forte (por exemplo, gere um com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) e `CLIENT_ORIGIN` com o domínio exacto do website Vercel, sem barra final. O Render fornece automaticamente `PORT`.
2. No Vercel, importe o mesmo repositório e defina o directório raiz como `frontend` (a configuração `frontend/vercel.json` configura a saída SPA). Defina `VITE_API_URL` como o URL público da API Render seguido de `/api` (por exemplo, `https://traco-api.onrender.com/api`) e publique.
3. Confirme o domínio de produção atribuído pelo Vercel, actualize `CLIENT_ORIGIN` no Render para esse domínio exacto e aguarde o novo deploy da API. Se houver domínios adicionais, separe-os por vírgulas.
4. Verifique `https://<api-render>/api/health`; a resposta deve indicar `status: "ok"` e `database: "connected"`. Teste também o login, formulários e navegação directa para uma página de projecto.

O seed do administrador não é executado automaticamente no deploy. Se a base Atlas já contém o administrador, não volte a executá-lo. Caso ainda não exista, execute `npm run seed:admin -w backend` uma única vez num ambiente ligado à mesma base Atlas e defina `ADMIN_NAME`, `ADMIN_EMAIL` e uma palavra-passe única com pelo menos 12 caracteres nesse ambiente. Não guarde segredos em ficheiros versionados nem os envie no chat. Configure Cloudinary e SMTP no Render apenas se for usar uploads e notificações por email.

Para a lista de acesso de rede do Atlas, permita o acesso de saída do Render conforme as opções disponíveis no plano; restringir por IP é preferível. Não use uma lista de acesso aberta sem compreender o risco. As variáveis marcadas `sync: false` no Blueprint devem ser preenchidas no painel do Render e nunca devem ser adicionadas ao repositório.

## Funcionalidades incluídas

- Website responsivo em português com páginas institucionais, serviços, portfólio, contactos e formulário de orçamento em etapas.
- Páginas individuais de projecto com visualizador 3D interactivo, vistas de planta, exterior e interior, e suporte a modelos GLB e imagens de planta técnica.
- API REST com autenticação JWT em cookie HttpOnly, papéis de utilizador, limites de tentativas de login, validação, CORS e Helmet.
- Modelos Mongoose para utilizadores, clientes, serviços, projectos, pedidos de orçamento, propostas, notificações e registo de actividade.
- Área administrativa com indicadores reais da API, listagens pesquisáveis e operações de gestão de clientes, pedidos, propostas, projectos e serviços.
- Upload validado para Cloudinary, notificações SMTP opcionais e geração de PDF de propostas quando configurados/disponíveis.

## Limites do protótipo

Os textos, contactos, projectos de exemplo e imagens são conteúdo ilustrativo. O visualizador apresenta uma casa demonstrativa quando um projecto não tem um modelo 3D carregado. Para carregar um projecto real, active Cloudinary no backend, crie o projecto no painel, seleccione um ficheiro `.glb` e, opcionalmente, uma planta JPG/PNG/WebP e publique-o no portfólio. Os modelos devem incluir uma vista em corte ou os espaços internos expostos para que o modo interior seja visível; o modo de planta oferece uma vista superior 3D do modelo. Antes de produção, configure os serviços externos e o domínio, substitua os dados de demonstração e reveja os fluxos de aprovação, políticas de privacidade, backups e permissões de utilizadores. O painel fornece CRUD básico, não inclui ainda gestão completa de utilizadores nem edição de propostas com linhas detalhadas.
