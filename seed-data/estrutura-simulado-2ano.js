/**
 * Estrutura canônica do "SIMULADO SARESP — 2º ANO — 2026" (PoC v3.1), no formato do backup JSON.
 * Gabaritos/habilidades das objetivas ficam vazios aqui e são preenchidos a partir de
 * seed-data/backup_saresp_OHV_2026-11-06.json, quando o arquivo existir.
 */
const objetiva = (code, disc, peso = 1) => ({ code, disc, tipo: 'obj', gab: '', peso, hab: '', desc: '' });

const LP17 = {
  code: 'LP17',
  disc: 'LP',
  tipo: 'texto',
  gab: '',
  peso: 1,
  hab: '',
  desc: 'Produção de texto – narrativa a partir de situação motivadora',
  aspectos: [
    {
      id: 'A1',
      nome: 'Adequação à proposta',
      sobre:
        'Coerência textual: o estudante compreende a proposta e desenvolve o tema; a narrativa (ou relato) deve referir-se ao suporte motivador, sendo possível elaborar diversos contextos, desde que plausíveis.',
      escala: [
        {
          c: 'A',
          pts: 2,
          desc: 'Escreveu uma história coerente em relação à situação motivadora.',
        },
        {
          c: 'B',
          pts: 1,
          desc: 'Escreveu uma história com pouca plausibilidade em relação à situação motivadora (desenvolve o tema de forma tangencial – abordagem parcial/superficial).',
        },
        {
          c: 'C',
          pts: 0,
          desc: 'Texto não coerente com a sequência de imagens/situação motivadora – fuga ao tema. Não impede a avaliação dos demais aspectos.',
        },
      ],
    },
    {
      id: 'A2',
      nome: 'Tipologia textual',
      sobre: 'Domínio da estrutura do texto narrativo para desenvolver o tema proposto.',
      escala: [
        {
          c: 'A',
          pts: 3,
          desc: 'Apresenta todos os elementos da narrativa: narrador, lugar/espaço, tempo, personagens praticando ação/ações e enredo (situação inicial, situação central e desfecho).',
        },
        {
          c: 'B',
          pts: 2,
          desc: 'Ausência de 1 (um) ou mais elementos constitutivos da narrativa.',
        },
        {
          c: 'C',
          pts: 1,
          desc: 'Apenas enumerou ou descreveu aspectos relativos a uma personagem e/ou fato(s).',
        },
        {
          c: 'D',
          pts: 0,
          desc: 'Texto não se configura como narrativa (outra estrutura: bilhete, receita, poema, lista etc.).',
        },
      ],
    },
    {
      id: 'A3',
      nome: 'Uso da página',
      sobre:
        'Uso adequado do espaço delimitado: direções da escrita, margens, linha e sequência. Não penalizar quem inicia na 1ª ou 2ª linha, com ou sem parágrafo; aceito “pular” uma linha entre frases.',
      escala: [
        {
          c: 'A',
          pts: 2,
          desc: 'Usa o espaço de forma adequada, seguindo todas as regras de uso da página (direções da escrita, margens, linha e sequência – mudança de linha).',
        },
        {
          c: 'B',
          pts: 1,
          desc: 'Escreveu sem seguir, pelo menos, uma das regras de uso da página.',
        },
        {
          c: 'C',
          pts: 0,
          desc: 'Escreveu sem seguir as regras de uso da página.',
        },
      ],
    },
    {
      id: 'A4',
      nome: 'Ortografia',
      sobre: 'Domínio da ortografia da variedade padrão da Língua Portuguesa.',
      escala: [
        {
          c: 'A',
          pts: 2,
          desc: 'Sem desvios – nível Ortográfico (até 3 desvios, desde que sem recorrência).',
        },
        {
          c: 'B',
          pts: 1,
          desc: 'Com desvios – nível Alfabético.',
        },
        {
          c: 'C',
          pts: 0,
          desc: 'Com desvios – nível Silábico-alfabético, sendo possível compreender a escrita sem maior cooperação.',
        },
      ],
    },
    {
      id: 'A5',
      nome: 'Pontuação',
      sobre: 'Emprego de ponto final, exclamação, interrogação e travessão.',
      escala: [
        {
          c: 'A',
          pts: 3,
          desc: 'Pontuou adequadamente (até 1 desvio sem recorrência, tendo empregado 2 ou mais sinais).',
        },
        {
          c: 'B',
          pts: 2,
          desc: 'Pontuou inadequadamente na maioria das vezes.',
        },
        {
          c: 'C',
          pts: 1,
          desc: 'Utilizou apenas 1 (um) ponto para concluir o texto.',
        },
        {
          c: 'D',
          pts: 0,
          desc: 'Não fez uso de qualquer sinal de pontuação.',
        },
      ],
    },
    {
      id: 'A6',
      nome: 'Coesão',
      sobre: 'Conexão entre os elementos linguísticos, ligando as partes do texto de forma linear.',
      escala: [
        {
          c: 'A',
          pts: 3,
          desc: 'Articula as ideias por meio de conexões, substituições e/ou marcas linguísticas (até 1 desvio sem recorrência; elementos coesivos usados mais de 1 vez).',
        },
        {
          c: 'B',
          pts: 2,
          desc: 'Articula as ideias com algumas falhas no uso dos conectivos.',
        },
        {
          c: 'C',
          pts: 1,
          desc: 'Muitas falhas no uso dos conectivos, comprometendo a compreensão.',
        },
        {
          c: 'D',
          pts: 0,
          desc: 'Sem articulação entre as partes – lista de palavras e/ou frases soltas.',
        },
      ],
    },
    {
      id: 'A7',
      nome: 'Segmentação',
      sobre: 'Reconhecimento da unidade palavra em frases (desvios de hipossegmentação e hipersegmentação).',
      escala: [
        {
          c: 'A',
          pts: 2,
          desc: 'Segmentou adequadamente todas as palavras do texto.',
        },
        {
          c: 'B',
          pts: 1,
          desc: 'Poucos desvios de segmentação em relação ao texto como um todo.',
        },
        {
          c: 'C',
          pts: 0,
          desc: 'Desvios de segmentação ao longo de todo o texto.',
        },
      ],
    },
  ],
};

const MT20 = {
  code: 'MT20',
  disc: 'MT',
  tipo: 'esc',
  gab: '',
  peso: 1,
  hab: 'EF02MA06',
  desc: 'RESOLVER PROBLEMAS DE ADIÇÃO ENVOLVENDO NÚMEROS NATURAIS',
  item: 'M019474',
  enunc:
    'Hospital veterinário: escrever a quantidade de cachorros atendidos no domingo (resposta esperada: 3).',
  escala: [
    {
      c: 'A',
      cod: '20',
      cred: 'Integral',
      pts: 1,
      desc: 'Identifica a informação da terceira linha e última coluna: conclui que 3 cachorros foram atendidos no domingo.',
    },
    {
      c: 'B',
      cod: '10',
      cred: 'Parcial',
      pts: 0.5,
      desc: 'Identifica a informação da terceira linha e segunda coluna (cachorros atendidos no sábado = 12).',
    },
    {
      c: 'C',
      cod: '01',
      cred: 'Nenhum',
      pts: 0,
      desc: 'Identifica qualquer outra quantidade contida na tabela, diferente de 3 e 12.',
    },
    {
      c: 'D',
      cod: '02',
      cred: 'Nenhum',
      pts: 0,
      desc: 'Outras respostas.',
    },
  ],
};

const MT21 = {
  code: 'MT21',
  disc: 'MT',
  tipo: 'esc',
  gab: '',
  peso: 1,
  hab: 'EF02MA22',
  desc: 'LER E INTERPRETAR DADOS APRESENTADOS EM TABELA',
  item: 'EM020003H6',
  enunc: 'Rafaela comprou 11 maçãs, 5 limões e 12 laranjas: quantas frutas ao todo? (resposta esperada: 28).',
  escala: [
    {
      c: 'A',
      cod: '20',
      cred: 'Integral',
      pts: 1,
      desc: 'Soma 11 maçãs + 5 limões + 12 laranjas, obtendo 28 frutas (apresenta o raciocínio).',
    },
    {
      c: 'B',
      cod: '21',
      cred: 'Integral',
      pts: 1,
      desc: 'Entrega 28 frutas como resposta, sem apresentar o raciocínio.',
    },
    {
      c: 'C',
      cod: '10',
      cred: 'Parcial',
      pts: 0.5,
      desc: 'Soma apenas 2 frutas, obtendo respostas parciais: 16, 23 ou 17 frutas.',
    },
    {
      c: 'D',
      cod: '01',
      cred: 'Nenhum',
      pts: 0,
      desc: 'Efetua a soma de forma equivocada, obtendo qualquer outra resposta.',
    },
    {
      c: 'E',
      cod: '02',
      cred: 'Nenhum',
      pts: 0,
      desc: 'Outras respostas.',
    },
  ],
};

function estruturaCanonica() {
  const questoes = [];
  for (let i = 1; i <= 16; i++) {
    const c = `LP${String(i).padStart(2, '0')}`;
    if (i === 9) questoes.push(objetiva('LP09a', 'LP', 0.5), objetiva('LP09b', 'LP', 0.5));
    else questoes.push(objetiva(c, 'LP'));
  }
  questoes.push(JSON.parse(JSON.stringify(LP17)));
  for (let i = 1; i <= 19; i++) questoes.push(objetiva(`MT${String(i).padStart(2, '0')}`, 'MT'));
  questoes.push(JSON.parse(JSON.stringify(MT20)), JSON.parse(JSON.stringify(MT21)));
  // Gabaritos conhecidos dos itens desdobrados (seção 10 do escopo)
  questoes.find((q) => q.code === 'LP09a').gab = 'B';
  questoes.find((q) => q.code === 'LP09b').gab = 'D';
  return {
    versao: 3,
    meta: { titulo: 'SIMULADO SARESP', ano: '2º ANO', dataLP: '05/11/2026', dataMT: '09/11/2026' },
    questoes,
    alunos: [],
    resp: {},
  };
}

module.exports = { estruturaCanonica };
