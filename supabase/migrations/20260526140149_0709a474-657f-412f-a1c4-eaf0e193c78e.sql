UPDATE public.leads SET company_name = v.company_name, updated_at = now()
FROM (VALUES
  ('paulamep@gmail.com', 'Alvorada'),
  ('rosangelasilvamartins@yahoo.com.br', 'Refap S/A - Refinaria Alberto Pasqualini'),
  ('rodriguesary@gmail.com', 'Smart Consulting'),
  ('rubiataba@drogariasultrapopular.com.br', 'Ultra popular'),
  ('shayennew@hotmail.com', 'SG Condultoria'),
  ('jana.correia@hotmail.com', 'Electro Aço Altona S.A.'),
  ('lorenilsen@hotmail.com', 'Hospital das Clínicas de Ribeirão Preto'),
  ('rosyiamasa@hotmail.com', 'Oi'),
  ('adilson.calazans@outlook.com', 'Tagus-Tec Serviços Tecnológicos Ltda'),
  ('lgarcianeia@gmail.com', 'Rodonaves'),
  ('thaisperafan@gmail.com', 'Farmácia'),
  ('fabinogueira2010@gmail.com', 'Algar'),
  ('suporte2roberthabaldoino@gmail.com', 'MAESTRIA gestão de negócios'),
  ('graciellidiassilva@gmail.com', 'Conquista'),
  ('klebbia@importinvest.com.br', 'Importinvest Imp Com Ltda'),
  ('laurinhaa0604@gmail.com', 'Special'),
  ('makeli.bombassaro@corpalms.com.br', 'Corpal incorporadora'),
  ('rafaelcostalizo@gmail.com', 'Bb seguros'),
  ('elisete_ferreira@yahoo.com.br', 'Não disponível')
) AS v(email, company_name)
WHERE lower(public.leads.email) = lower(v.email)
  AND (public.leads.company_name IS NULL OR public.leads.company_name = '');