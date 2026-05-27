# Coleção de referências — infográficos médico-acadêmicos premium

Os arquivos PNG nesta pasta são usados como **imagens de referência** pelo
endpoint `/api/ai/illustrate` via gpt-image-1 `/v1/images/edits`. Cada
geração nova recebe essas refs e o modelo mantém a identidade visual
(paleta, layout, tipografia, estilo das moléculas/órgãos).

Sem refs, o endpoint cai pro modo `generations` puro — qualidade ainda
boa mas com mais variância de estilo entre uma imagem e outra.

## Como adicionar/atualizar refs

1. Salvar PNG/JPEG com um dos nomes canônicos abaixo
2. Cada arquivo ≤ 5 MB recomendado (gpt-image-1 aceita até 50 MB mas
   maior = mais lento pra fazer upload em cada geração)
3. Commitar — Vercel rebuilda e os arquivos ficam servidos via
   `lumioapp.net/reference-images/medical-collection/<nome>.png`

## Nomes canônicos (até 4)

- `01-origem-destino-aminoacidos.png` — overview/macro view com órgãos+moléculas
- `02-transaminacao-desaminacao.png` — passo-a-passo com 3 blocos numerados
- `03-ciclo-ureia.png` — ciclo bioquímico com mitocôndria + citoplasma
- `04-marcadores-clinicos.png` — considerações clínicas com órgãos+ícones

Outros nomes são ignorados. O endpoint lê SÓ esses 4 (ou os que existirem).

## Por que essas imagens?

São o "norte visual" da coleção — definidas pelo founder como o padrão
que TODA imagem gerada via Lumi deve seguir. Trocar ou ampliar a coleção
só se a identidade visual mudar.
