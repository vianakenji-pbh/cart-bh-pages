# Biblioteca CART-BH — versão estática para GitHub Pages

Esta pasta contém apenas a versão publicável, para uso no computador: HTML, CSS, JavaScript, D3 7.9.0 com licença ISC e dados JSON. Não exige servidor de aplicação, Node ou CDN. Não inclui PDFs locais; os botões abrem os documentos oficiais do CART-BH.

O acervo contém 1.825 documentos (353 CRT e 1.472 JJT), um tema/subtema aprovado e grafo com 1.827 nós e 235 conexões. A síntese e o quadro mantêm 18 acórdãos de 16 processos, com filtros Todos 18 / A favor 13 / Contra 4 / Parcial 1, fontes e datas de publicação.

A navegação usa `#/...`, para funcionar na raiz ou sob uma subpasta sem regras de redirecionamento. Exemplos: `#/pesquisa`, `#/tema/poder_revisao/ciencia_fisco?resultado=contra`, `#/?tab=graph&doc=crt-11498` e `#/julgado/crt-11280`. Links diretos, recarga, histórico e leitor funcionam na hospedagem estática.

A capa, os temas e o grafo não carregam o índice textual. Busca sem palavras e filtros de metadados carregam somente o catálogo leve. Ao pesquisar palavras, um Worker carrega os textos comprimidos em gzip quando o navegador suporta DecompressionStream, com fallback para JSON, e executa a busca fora da interface. Ranking, números com/sem pontuação, acentos, termos combinados, filtros, paginação e trechos seguem as regras do protótipo Python. O leitor carrega o JSON individual do documento; o grafo mantém seu Worker e D3 locais.

## Regerar a partir das fontes

Na pasta de origem `baixa-cart`:

```powershell
python -B site/export_pages.py --output ../cart-bh-pages
python -B -m unittest discover -s site -p test_pages.py -v
node site/test_pages.cjs
```

O gerador usa a Library existente, o conteúdo editorial e os arquivos atuais da interface. Ele falha explicitamente se os padrões de adaptação mudarem. A reconstrução gerencia somente arquivos listados em `build-manifest.json`, preservando `.git`, outros arquivos e este README já existente. O manifest traz contagens e SHA-256 dos arquivos gerenciados; não inclui o próprio hash. Para atualizar este README automaticamente, remova-o antes de regerar.

## Conferir localmente

Na pasta que contém `cart-bh-pages`:

```powershell
python -m http.server 8767 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8767/cart-bh-pages/`. Esse servidor entrega somente arquivos, sem `/api`. Use HTTP; abrir index.html diretamente por file:// impede os Workers e o carregamento de JSON.

## Publicar com a ajuda do script local

Na pasta de origem `baixa-cart`, o script `site/publicar_pages.ps1` valida o manifest e pode criar o repositório e ativar Pages após autenticação oficial no GitHub CLI:

```powershell
gh auth login --hostname github.com --web
powershell -File site/publicar_pages.ps1 -CheckOnly
powershell -File site/publicar_pages.ps1
```

Se o CLI foi instalado de forma portátil, use o caminho informado ao executável no comando de login. O script fica nas fontes locais; não precisa ser enviado ao site.

## Publicar manualmente pelo GitHub

1. Crie um repositório para esta versão, por exemplo `cart-bh-pages`.
2. Na pasta `cart-bh-pages`, use Git para enviar o conteúdo à branch `main` (troque `SUA-CONTA` pelo seu usuário):

```powershell
git init -b main
git add .
git commit -m "Publica biblioteca CART-BH"
git remote add origin https://github.com/SUA-CONTA/cart-bh-pages.git
git push -u origin main
```

`index.html` deve estar na raiz do repositório, com `data`, `vendor`, JavaScript/CSS e `.nojekyll`. Use Git para enviar o acervo completo, pois o upload pelo navegador tem limites por lote. Não envie a pasta de origem com Python, PDFs ou arquivos de pesquisa.
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Escolha **main** e **/(root)**, depois **Save**.
6. Aguarde a implantação e abra o endereço mostrado pelo GitHub. Confira a busca, um documento direto, a síntese e o grafo.

Para atualizar, gere novamente a pasta a partir das fontes, confira os testes e envie os arquivos gerenciados atualizados à mesma branch. A geração local não cria repositórios nem publica por conta própria.
