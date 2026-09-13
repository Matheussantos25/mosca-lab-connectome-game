![MOSCA.LAB: fruit fly and neural connectome](assets/flywire-neural-arena.png)

# MOSCA.LAB

### 668 neurônios reais contra uma política aleatória

[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-9cdb64?style=flat-square&logo=javascript&logoColor=111612)](app.js)
[![FlyWire](https://img.shields.io/badge/FlyWire-FAFB%20v783-9cdb64?style=flat-square)](https://flywire.ai/)
[![Data](https://img.shields.io/badge/conexões-18.968-9cdb64?style=flat-square)](data/PROVENANCE.md)
[![License](https://img.shields.io/badge/dados-CC%20BY--NC%204.0-9cdb64?style=flat-square)](data/DATA_LICENSE.md)

**MOSCA.LAB** é um experimento jogável de Data Science que conecta um subconjunto real do conectoma da *Drosophila melanogaster* a uma arena 2D. O projeto compara o circuito neural com um baseline aleatório, registra cada decisão e exporta a série temporal para análise.

> Pergunta do experimento: **um circuito baseado em conexões reais consegue coletar frutas com mais eficiência que uma política aleatória?**

## O que você pode fazer

- Assistir a 668 neurônios LIF dispararem sobre 18.968 conexões medidas.
- Alternar entre **Conectoma** e **Baseline aleatório**.
- Medir frutas por minuto, eficiência de trajetória e colisões.
- Executar rodadas comparáveis de 60 segundos.
- Ativar plasticidade sináptica baseada em recompensa.
- Exportar sensores, motores, decisões e métricas para CSV.
- Copiar um resumo da rodada já formatado para LinkedIn.

## Dados reais utilizados

O circuito deriva do **FlyWire FAFB v783**, um conectoma do cérebro de uma mosca adulta. O recorte contém:

| População | Papel usado no experimento |
| --- | --- |
| LC4 e LPLC2 | Detecção visual de aproximação |
| Giant Fiber, DNp01 | Resposta de fuga |
| DNa01 e DNa02 | Direção e steering |
| DNp09 | Caminhada para frente |
| MDN | Movimento para trás |
| DNg11 | Circuito descendente associado a grooming |
| 330 parceiros | Propagação intermediária no subgrafo |

Cada neurônio mantém `root_id`, tipo celular, lado e posição. Cada conexão mantém origem, destino e contagem de contatos sinápticos com sinal derivado da previsão de neurotransmissor.

```text
Ambiente 2D
   │
   ├── visão, odor e perigo (interface modelada)
   ▼
LC4 / LPLC2 ──► grafo FlyWire FAFB v783 ──► neurônios descendentes
                                                    │
                                                    ▼
                                      direção, avanço e fuga
                                                    │
                                                    ▼
                                      telemetria + métricas CSV
```

## O que é medido e o que é modelado

| Camada | Origem |
| --- | --- |
| IDs, tipos e posições dos neurônios | Medidos no FlyWire |
| Direção e quantidade de sinapses | Medidas no FlyWire |
| Sinal excitatório ou inibitório | Inferido pelo neurotransmissor previsto |
| Correntes sensoriais | Modeladas para o jogo |
| Dinâmica LIF, limiares e ruído | Modelados |
| Plasticidade por recompensa | Modelada, mantida apenas em memória |
| Corpo, movimento e colisões | Modelados |

O projeto não é uma reconstrução de um cérebro vivo. O conectoma fornece anatomia e conectividade, não toda a fisiologia necessária para reproduzir comportamento biológico.

## Métricas do benchmark

- **Frutas/min:** taxa de coleta normalizada pelo tempo.
- **Eficiência:** distância em que a mosca se aproximou do alvo dividida pela distância total percorrida.
- **Colisões:** contatos com paredes e zonas de perigo.
- **Spikes/s:** disparos observados no circuito durante a janela atual.
- **Amostras:** linhas de telemetria registradas a cada 500 ms.

O CSV exportado inclui os seis canais sensoriais, três canais motores, decisão, modo do controlador, pontuação e métricas acumuladas.

## Executar localmente

Não há dependências ou processo de build.

```powershell
python -m http.server 8080
```

Acesse [http://localhost:8080](http://localhost:8080), escolha o controlador e clique em **Iniciar**.

## Testar a integridade dos dados

```powershell
node tests/connectome.test.js
node --check app.js
```

O teste valida o SHA-256, a quantidade de neurônios e conexões, IDs únicos, posições, índices das arestas e presença de sinais excitatórios e inibitórios.

## Estrutura

```text
.
├── index.html                       interface e estrutura semântica
├── styles.css                      sistema visual responsivo
├── app.js                          jogo, rede LIF e telemetria
├── assets/
│   └── flywire-neural-arena.png    capa do projeto
├── data/
│   ├── flywire-circuit.json        subconjunto do conectoma
│   ├── PROVENANCE.md               origem e fronteira do modelo
│   └── DATA_LICENSE.md             licença dos dados
├── tests/
│   └── connectome.test.js          testes de integridade
└── LINKEDIN_POST.md                texto sugerido para divulgação
```

## Reprodutibilidade e proveniência

O arquivo foi fixado por SHA-256 e associado à revisão do extrator que o gerou. Consulte [data/PROVENANCE.md](data/PROVENANCE.md) para URLs, hash, critérios do recorte, publicações e limitações.

Fontes científicas:

- Dorkenwald, S. et al. [Neuronal wiring diagram of an adult brain](https://doi.org/10.1038/s41586-024-07558-y). *Nature* 634, 124-138 (2024).
- Schlegel, P. et al. [Whole-brain annotation and multi-connectome cell typing of Drosophila](https://doi.org/10.1038/s41586-024-07686-5). *Nature* 634, 139-152 (2024).

## Licença

O código do jogo é disponibilizado sob a licença MIT. O subconjunto derivado do FlyWire permanece sob **CC BY-NC 4.0**, com atribuição obrigatória e uso não comercial. Veja [data/DATA_LICENSE.md](data/DATA_LICENSE.md).

## Autor

**Matheus Santos**  
Data Scientist | Data Analyst  
[GitHub @Matheussantos25](https://github.com/Matheussantos25)
