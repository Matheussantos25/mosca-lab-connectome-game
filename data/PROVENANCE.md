# Proveniência do subconjunto FlyWire

## Arquivo incorporado

- Dataset de origem: FlyWire FAFB v783, cérebro de uma fêmea adulta de *Drosophila melanogaster*
- Recorte local: `flywire-circuit.json`
- Neurônios: 668
- Conexões dirigidas: 18.968
- SHA-256 local: `DA53640E4DC7071C26892870EC5B28984C4CFC74C1C44D3A3CDE0A2913579D0F`
- Repositório do extrator: <https://github.com/DenisSergeevitch/desktop-fly>
- Revisão consultada: `32b00011e83c3dc85fa3ea0b3934155b04f1635d`
- URL do arquivo: <https://raw.githubusercontent.com/DenisSergeevitch/desktop-fly/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/circuit.json>

O recorte contém LC4 e LPLC2, populações associadas a estímulos visuais de aproximação, além de Giant Fiber, DNa01, DNa02, DNp09, DNg11, MDN e seus parceiros mais fortes. Cada neurônio preserva o `root_id`, tipo celular, lado e posição. Cada aresta preserva os índices dos neurônios e a contagem de sinapses com sinal derivado da previsão de neurotransmissor.

## O que é medido

- Identidade e posição dos neurônios
- Direção das conexões
- Contagem de contatos sinápticos
- Sinal excitatório ou inibitório inferido do neurotransmissor

## O que é modelado neste jogo

- Dinâmica LIF, limiares e ruído
- Conversão de visão, odor e perigo em corrente neural
- Normalização das contagens sinápticas
- Conversão da atividade descendente em velocidade e direção
- Regra de plasticidade por recompensa

O arquivo anatômico não é alterado durante a execução. A plasticidade usa multiplicadores mantidos apenas na memória e reiniciados junto com a partida.

## Citação

Dorkenwald, S. et al. *Neuronal wiring diagram of an adult brain*. Nature 634, 124-138 (2024). <https://doi.org/10.1038/s41586-024-07558-y>

Schlegel, P. et al. *Whole-brain annotation and multi-connectome cell typing of Drosophila*. Nature 634, 139-152 (2024). <https://doi.org/10.1038/s41586-024-07686-5>

Os dados derivados do FlyWire são distribuídos sob CC BY-NC 4.0. Consulte `DATA_LICENSE.md`.
