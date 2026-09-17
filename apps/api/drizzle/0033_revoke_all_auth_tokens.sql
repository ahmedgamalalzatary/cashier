-- Custom SQL migration file, put your code below! --
-- Auth moved to an HttpOnly cookie: bump every user's token version so all
-- previously issued Bearer tokens stop authenticating and every session is
-- forced through the new cookie flow.
UPDATE `users` SET `token_version` = `token_version` + 1;