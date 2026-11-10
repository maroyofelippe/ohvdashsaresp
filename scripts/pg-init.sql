-- Executado apenas na primeira inicialização do contêiner PostgreSQL (como superusuário).
-- Cria o banco usado pelos testes; a extensão unaccent é criada pela própria migration.
SELECT format('CREATE DATABASE %I OWNER %I', 'OHVDashSaresp_test', current_user)
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'OHVDashSaresp_test')\gexec
