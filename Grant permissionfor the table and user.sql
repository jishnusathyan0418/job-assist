GRANT SELECT ON TABLE public.jobs TO "jobsuer";

SELECT has_table_privilege(
    'jobuser',
    'public.jobs',
    'SELECT'
);

 SELECT id from jobs;
