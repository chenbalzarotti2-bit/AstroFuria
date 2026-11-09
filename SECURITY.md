# Security Policy / Politica di sicurezza

## Cosa è protetto da questo repository
Questo progetto è un gioco statico (HTML/JS/TS) senza backend né database.
Non deve contenere MAI:

- API key, token, password, chiavi private (es. service_role Supabase, PAT GitHub)
- indirizzi email personali o dati personali nel codice o negli commit
- file `.env` (solo `.env.example` con valori vuoti può essere committato)

## Regole operative
1. Prima di ogni `git push`, eseguire una scansione secret:
   - `gitleaks detect --source .` oppure `trufflehog filesystem .`
2. Attivare su GitHub **Secret scanning + Push protection**
   (Settings → Code security and analysis).
3. Le eventuali chiavi "public/anon" del frontend vanno limitate con
   domain allowlist e RLS lato provider, non considerate segrete.
4. Non riusare la stessa password/token in altri servizi.

## Segnalazione vulnerabilità
Apri un issue privato/contact diretto invece di pubblicare dettagli
exploit in chiaro nel repository.
