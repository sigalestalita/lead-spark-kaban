export type Ocorrencias = {
  cpt: number | null;
  spt: number | null;
  cdmA: number | null;
  qaA: number | null;
  sancoes: number | null;
};

export type Colaborador = {
  nome: string;
  compatibilidade: number;
  tempoGerdau: string;
  tempoLideranca: string;
  ocorrencias: Ocorrencias;
  semDados?: boolean;
  recomendacao?: string;
};

export type CargoDataset = {
  id: string;
  nome: string;
  periodo: string;
  descricao: string;
  repna: { r: number; e: number; p: number; n: number; a: number };
  colaboradores: Colaborador[];
};

export const TIPOS_OCORRENCIA = [
  { key: "cpt", label: "CPT", desc: "Evento com pessoas que gerou afastamento" },
  { key: "spt", label: "SPT", desc: "Evento com pessoas sem afastamento" },
  { key: "cdmA", label: "CDM-A", desc: "Evento com equipamentos com potencial de acidente grave" },
  { key: "qaA", label: "QA-A", desc: "Quase acidente com potencial de gravidade" },
  { key: "sancoes", label: "Sanções", desc: "Quantidade de sanções por segurança" },
] as const;

export type TipoOcorrenciaKey = (typeof TIPOS_OCORRENCIA)[number]["key"];

export const coordenadorRotina: CargoDataset = {
  id: "coordenador-rotina",
  nome: "Coordenador de Rotina",
  periodo: "Últimos 12 meses",
  descricao:
    "Coordenação das equipes, processos e projetos da área em referência, promover o desenvolvimento sustentável, a produtividade, a eficiência dos processos e conformidade com os padrões de qualidade. Responsável por coordenar, planejar e controlar as atividades de manutenção preventiva, preditiva e corretiva dos equipamentos e instalações industriais, assegurando a máxima disponibilidade e confiabilidade operacional. Atua na gestão de equipes técnicas, garantindo o cumprimento de padrões de segurança, qualidade e meio ambiente, bem como a otimização de custos e recursos. Participa de análises de falhas junto com analistas e especialistas, acompanha indicadores de desempenho (KPIs), visando o aumento da eficiência dos ativos e a redução de paradas não programadas. Interage com as áreas de produção, engenharia e suprimentos para alinhar prioridades, apoiar projetos e garantir a execução eficaz dos planos de manutenção. Também é responsável por desenvolver a equipe, assegurar a conformidade com normas técnicas e regulamentadoras, e promover uma cultura de segurança e excelência operacional.",
  repna: { r: 0, e: 40, p: 60, n: 100, a: 50 },
  colaboradores: [
    { nome: "Guilherme Santos", compatibilidade: 96, tempoGerdau: "12 anos", tempoLideranca: "1 ano e 8 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 1, qaA: 0, sancoes: 1 }, recomendacao: "Pensamento analítico, atendimento ativo e precisão; racionalidade e objetividade" },
    { nome: "Eder Bittencourt", compatibilidade: 92, tempoGerdau: "7 anos", tempoLideranca: "7 anos", ocorrencias: { cpt: 0, spt: 0, cdmA: 0, qaA: 0, sancoes: 0 }, recomendacao: "Agilidade, dinamismo, pensamento analítico, atendimento ativo" },
    { nome: "Douglas Collus", compatibilidade: 91, tempoGerdau: "Novo", tempoLideranca: "Novo", ocorrencias: { cpt: 0, spt: 0, cdmA: 4, qaA: 0, sancoes: 0 }, recomendacao: "Socialização, influência, extroversão" },
    { nome: "André Freitas", compatibilidade: 91, tempoGerdau: "36 anos", tempoLideranca: "8 anos e 7 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 0, qaA: 0, sancoes: 0 }, recomendacao: "Socialização, influência, extroversão, agilidade, dinamismo" },
    { nome: "Lenner Monteiro Santos", compatibilidade: 85, tempoGerdau: "12 anos", tempoLideranca: "3 anos e 10 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 0, qaA: 0, sancoes: 1 }, recomendacao: "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, socialização, influência, extroversão" },
    { nome: "Carlos Alberto Taveira", compatibilidade: 84, tempoGerdau: "25 anos", tempoLideranca: "8 anos e 7 meses", ocorrencias: { cpt: null, spt: null, cdmA: null, qaA: null, sancoes: 0 }, semDados: true, recomendacao: "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação" },
    { nome: "Tairone Fernandes", compatibilidade: 77, tempoGerdau: "5 anos", tempoLideranca: "4 anos", ocorrencias: { cpt: 0, spt: 0, cdmA: 0, qaA: 0, sancoes: 2 }, recomendacao: "Calma, paciência, consistência e planejamento" },
    { nome: "Marlon Gomes", compatibilidade: 67, tempoGerdau: "4 anos", tempoLideranca: "4 anos", ocorrencias: { cpt: 0, spt: 0, cdmA: 1, qaA: 0, sancoes: 1 }, recomendacao: "Agilidade, dinamismo, precisão, orientação ao detalhe e disciplina; racionalidade e objetividade" },
    { nome: "Raphael Bonafé", compatibilidade: 64, tempoGerdau: "13 anos", tempoLideranca: "5 anos e 4 meses", ocorrencias: { cpt: 1, spt: 0, cdmA: 0, qaA: 0, sancoes: 10 }, recomendacao: "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, calma, paciência, consistência e planejamento" },
    { nome: "Rafael Felicio", compatibilidade: 63, tempoGerdau: "13 anos", tempoLideranca: "8 anos e 7 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 1, qaA: 0, sancoes: 5 }, recomendacao: "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, socialização, influência, extroversão. Racionalidade e objetividade" },
    { nome: "Marcelo Rimulo", compatibilidade: 60, tempoGerdau: "6 anos", tempoLideranca: "6 anos", ocorrencias: { cpt: 1, spt: 0, cdmA: 0, qaA: 0, sancoes: 0 }, recomendacao: "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, calma, paciência, consistência e planejamento" },
    { nome: "Cristiano Moreira", compatibilidade: 48, tempoGerdau: "4 anos", tempoLideranca: "2 anos e 6 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 0, qaA: 0, sancoes: 2 }, recomendacao: "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, pensamento analítico, concentração, observação." },
    { nome: "Helder Fleishmann", compatibilidade: 10, tempoGerdau: "16 anos", tempoLideranca: "8 anos e 6 meses", ocorrencias: { cpt: 0, spt: 2, cdmA: 6, qaA: 5, sancoes: 2 }, recomendacao: "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, pensamento analítico, concentração, observação, calma, paciência, consistência e planejamento, orientação ao detalhe, disciplina excelência técnica; racionalidade e objetividade" },
    { nome: "Marcos Gomes", compatibilidade: 7, tempoGerdau: "5 anos", tempoLideranca: "4 anos e 5 meses", ocorrencias: { cpt: 0, spt: 1, cdmA: 2, qaA: 0, sancoes: 4 }, recomendacao: "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, pensamento analítico, concentração, observação, calma, paciência, consistência e planejamento, orientação ao detalhe, disciplina, excelência técnica; racionalidade e objetividade" },
  ],
};

export const especialistaManutencao: CargoDataset = {
  id: "especialista-manutencao",
  nome: "Especialista de Manutenção",
  periodo: "Últimos 12 meses",
  descricao:
    "Responder pelo planejamento, acompanhamento, coordenação e supervisão das atividades de melhoria de processos e desenvolvimento dos processos de manutenção da Usina; Desenvolver, implantar e acompanhar processos de fabricação para novos produtos na Usina; Desenvolver, implantar e acompanhar técnicas de produção de melhoria contínua; Apoiar as áreas produtivas para atingir as metas de produtividade, rendimento e sucatamento; apoiar as áreas produtivas para definição dos futuros investimentos; Elaborar e implantar treinamentos técnicos e operacionais para capacitação dos colaboradores; Assegurar o cumprimento de processos padrões de produção; Realizar tratamentos de falhas crônicas e acompanhar a execução dos planos de ação. Responsável por atuar como referência técnica na gestão e otimização dos processos de manutenção industrial, garantindo a confiabilidade, disponibilidade e desempenho dos ativos produtivos. Desenvolve e implementa estratégias de manutenção preventiva, preditiva e corretiva, com base em metodologias de análise de falhas e engenharia de confiabilidade. Realiza diagnósticos técnicos avançados, conduz análises de causa raiz (RCA) e propõe soluções para eliminação de falhas recorrentes, aumento da vida útil dos equipamentos e melhoria contínua dos processos. Atua na definição de planos de manutenção, padronização de procedimentos e especificação técnica de materiais e serviços. Acompanha e analisa indicadores de desempenho (KPIs), como MTBF, MTTR e disponibilidade, propondo ações para otimização de custos e aumento da eficiência operacional. Suporta tecnicamente as equipes de manutenção e operação, além de interagir com engenharia, produção e suprimentos em projetos de melhoria e implantação de novas tecnologias. Assegura o cumprimento das normas de segurança, meio ambiente e qualidade, promovendo boas práticas e contribuindo para a excelência operacional da organização.",
  repna: { r: 50, e: 60, p: 0, n: 90, a: 50 },
  colaboradores: [
    { nome: "Michel Ramos Rocha", compatibilidade: 98, tempoGerdau: "20 anos", tempoLideranca: "6 anos e 4 meses", ocorrencias: { cpt: 1, spt: 0, cdmA: 0, qaA: 0, sancoes: null }, recomendacao: "Iniciativa e influência" },
    { nome: "Paulo Cesar Faria", compatibilidade: 87, tempoGerdau: "9 anos", tempoLideranca: "7 anos e 7 meses", ocorrencias: { cpt: null, spt: null, cdmA: null, qaA: null, sancoes: null }, semDados: true, recomendacao: "Iniciativa, agilidade, influência; empatia e fluidez emocional" },
    { nome: "Inácio Satoshi Matsumoto", compatibilidade: 87, tempoGerdau: "15 anos", tempoLideranca: "8 anos e 7 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 1, qaA: 0, sancoes: null }, recomendacao: "Empatia e fluidez emocional" },
    { nome: "Pontinelle Godoi Estevam", compatibilidade: 83, tempoGerdau: "25 anos", tempoLideranca: "4 anos e 11 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 0, qaA: 0, sancoes: null }, recomendacao: "Influência, iniciativa e agilidade e senso de urgência; empatia e fluidez emocional" },
    { nome: "Fernando Yano", compatibilidade: 82, tempoGerdau: "20 anos", tempoLideranca: "8 anos e 7 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 2, qaA: 0, sancoes: null }, recomendacao: "Orientação a resultados e desafios, comunicação direta e assertiva, iniciativa, influência, agilidade, dinamismo, senso de urgência; empatia e fluidez emocional" },
    { nome: "Tafarel Dias", compatibilidade: 45, tempoGerdau: "12 anos", tempoLideranca: "2 anos e 10 meses", ocorrencias: { cpt: 0, spt: 2, cdmA: 6, qaA: 5, sancoes: null }, recomendacao: "Orientação a resultados e desafios, comunicação direta e assertiva, iniciativa, socialização, influência; agilidade, dinamismo, senso de urgência; empatia e fluidez emocional" },
    { nome: "Cosme Santiago Brito", compatibilidade: 18, tempoGerdau: "25 anos", tempoLideranca: "8 anos e 7 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 1, qaA: 0, sancoes: null }, recomendacao: "Orientação a resultados e desafios, comunicação direta e assertiva, iniciativa, socialização, influência; agilidade, dinamismo, senso de urgência, orientação ao detalhe, disciplina, excelência técnica" },
    { nome: "Rafael Scramin Rodrigues", compatibilidade: 12, tempoGerdau: "14 anos", tempoLideranca: "10 meses", ocorrencias: { cpt: 0, spt: 0, cdmA: 2, qaA: 0, sancoes: null }, recomendacao: "Orientação a resultados e desafios, comunicação direta e assertiva, iniciativa, socialização, influência; agilidade, dinamismo, senso de urgência, orientação ao detalhe, disciplina, excelência técnica" },
  ],
};

export const especialistaContratos: CargoDataset = {
  id: "especialista-contratos",
  nome: "Especialista em Contratos",
  periodo: "Últimos 12 meses",
  descricao:
    "Atuar como especialista na gestão de contratos da usina, influenciando aos administradores de contratos para buscar melhor desempenho dos fornecedores, atendimento aos requisitos da diretriz corporativa além dos requisitos de Segurança. Identificar riscos contratuais e propor ações preventivas e corretivas. Interface direta com fornecedores, SSMA, jurídico, suprimentos, financeiro e auditorias dos principais contratos da Usina. Garantir conformidade com políticas internas, normas de compliance, ética, segurança e meio ambiente. Padronização e melhoria contínua dos processos de gestão de contratos influenciando os administradores para o cumprimento. Atuar como multiplicador de conhecimento em boas práticas contratuais. Atuar na análise quanto a administração de contratos com fornecedores e prestadores de serviços, com foco em mitigação de riscos e maximização de valor para a organização. Atua também na resolução de desvios, gestão de pleitos e aplicação de penalidades quando necessário. Fiscaliza os administradores de contrato quanto ao cumprimento de normas legais, regulatórias, de segurança do trabalho e compliance, promovendo transparência, governança e excelência na gestão contratual.",
  repna: { r: 70, e: 0, p: 30, n: 100, a: 50 },
  colaboradores: [
    { nome: "Bruno Silva", compatibilidade: 94, tempoGerdau: "5 anos", tempoLideranca: "1 ano", ocorrencias: { cpt: null, spt: null, cdmA: null, qaA: null, sancoes: null }, semDados: true, recomendacao: "Empatia e fluidez emocional" },
  ],
};

export const cargos: CargoDataset[] = [
  coordenadorRotina,
  especialistaManutencao,
  especialistaContratos,
];

/* ---------------- Trainee (formato diferenciado) ---------------- */

export type TraineeAvaliacao = {
  cargoId: string;
  cargoNome: string;
  compatibilidade: number;
  recomendacao: string;
};

export type TraineeDataset = {
  id: string;
  nome: string;
  periodo: string;
  tipo: "trainee";
  descricao: string;
  colaborador: {
    nome: string;
    tempoGerdau: string;
  };
  avaliacoes: TraineeAvaliacao[];
  repna: { r: number; e: number; p: number; n: number; a: number };
};

export const traineeNatanael: TraineeDataset = {
  id: "trainee",
  nome: "Trainee",
  periodo: "Avaliação atual",
  tipo: "trainee",
  descricao:
    "Análise de compatibilidade do colaborador trainee frente aos três cargos avaliados, com recomendações de desenvolvimento específicas para cada perfil.",
  colaborador: {
    nome: "NATANAEL OLIVEIRA DA SILVA",
    tempoGerdau: "4 anos",
  },
  repna: { r: 73, e: 20, p: 7, n: 100, a: 0 },
  avaliacoes: [
    {
      cargoId: "especialista-contratos",
      cargoNome: "Especialista em Contratos",
      compatibilidade: 90,
      recomendacao:
        "Excelência técnica, atendimento ativo, pensamento analítico; racionalidade e objetividade",
    },
    {
      cargoId: "especialista-manutencao",
      cargoNome: "Especialista de Manutenção",
      compatibilidade: 84,
      recomendacao:
        "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, socialização, influência, persuasão; racionalidade e objetividade",
    },
    {
      cargoId: "coordenador-rotina",
      cargoNome: "Coordenador de Rotina",
      compatibilidade: 60,
      recomendacao:
        "Diplomacia, cautela, orientação para harmonia do ambiente e não confrontação, socialização, influência, persuasão, calma, paciência, consistência e planejamento; racionalidade e objetividade",
    },
  ],
};

export type AnyCargo = CargoDataset | TraineeDataset;

export const cargosCompletos: AnyCargo[] = [...cargos, traineeNatanael];

export function isTrainee(c: AnyCargo): c is TraineeDataset {
  return (c as TraineeDataset).tipo === "trainee";
}

export type Faixa = "excelente" | "muitoBoa" | "aceitavel" | "baixa";

export const FAIXAS: { key: Faixa; label: string; min: number; max: number; token: string }[] = [
  { key: "excelente", label: "Excelente", min: 90, max: 101, token: "faixa-excelente" },
  { key: "muitoBoa", label: "Muito Boa", min: 80, max: 90, token: "faixa-muito-boa" },
  { key: "aceitavel", label: "Aceitável", min: 60, max: 80, token: "faixa-aceitavel" },
  { key: "baixa", label: "Baixa", min: 0, max: 60, token: "faixa-baixa" },
];

export function getFaixa(compat: number): Faixa {
  if (compat >= 90) return "excelente";
  if (compat >= 80) return "muitoBoa";
  if (compat >= 60) return "aceitavel";
  return "baixa";
}

export function totalOcorrencias(o: Ocorrencias): number {
  return (
    (o.cpt ?? 0) + (o.spt ?? 0) + (o.cdmA ?? 0) + (o.qaA ?? 0) + (o.sancoes ?? 0)
  );
}
