-- Remove redundant (총무) suffix from names now that member_type exists.
UPDATE "User"
SET fullname = btrim(regexp_replace(fullname, '\s*\(총무\)', '', 'g'))
WHERE fullname LIKE '%(총무)%';
