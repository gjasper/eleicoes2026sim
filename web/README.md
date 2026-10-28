# Votos transferidos

App web para explorar o modelo de transferência eleitoral com Google OR-Tools CP-SAT compilado para WebAssembly. Os cálculos são feitos no navegador, sem Python ou serviço de solver.

## Executar localmente

```sh
npm install
npm run dev
```

Os servidores de desenvolvimento e pré-visualização do Vite definem os cabeçalhos de isolamento entre origens exigidos pelo runtime WASM. A hospedagem de produção também deve enviar:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Publicar no Cloudflare Pages

1. Conecte o repositório ao Cloudflare Pages e configure o diretório raiz da aplicação como `web`.
2. Use `npm run build` como comando de build e `dist` como diretório de saída.
3. Configure `NODE_VERSION` como `22` nas variáveis de ambiente de build.
4. Faça o deploy. O arquivo `public/_headers` é copiado para `dist/_headers` e habilita os cabeçalhos COOP/COEP necessários para o CP-SAT em WebAssembly.

Depois de publicar, abra a página e confirme no navegador que `crossOriginIsolated` é `true`; o app verifica essa condição antes de iniciar o solver.

## Comportamento do modelo

- Os 5 grupos de origem e os 4 grupos de destino respeitam seus totais de entrada.
- O app calcula os valores exatos mínimo e máximo para as 20 transferências.
- Alterações nos valores mínimo e máximo iniciam um novo cálculo CP-SAT; combinações sem solução são desfeitas.
- “Encontrar solução” guarda atribuições exatas e distintas no navegador, cada uma com os 20 valores.

Solver library: [`cp-sat-wasm`](https://www.npmjs.com/package/cp-sat-wasm), based on [Axelwickm/or-tools-wasm](https://github.com/Axelwickm/or-tools-wasm).