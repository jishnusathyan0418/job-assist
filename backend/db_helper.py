import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import os

load_dotenv()

DB_SETTINGS = {
    "host": os.getenv("DB_HOST"),  
    "port": os.getenv("DB_PORT"),
    "dbname": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD")
}

def get_db_connection():
    """Establishes and returns a raw connection to the database."""
    return psycopg2.connect(**DB_SETTINGS)

def fetch_jobs():
    query = """
    SELECT * FROM jobs
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query)
            jobs = cur.fetchall()
            return jobs
    finally:
        conn.close()


def fetch_jobs_id(job_id):
    conn = get_db_connection()
    query = """
    SELECT *
FROM jobs
WHERE id = %s;
    """
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as curr:
            curr.execute(query, (str(job_id),))
            jobs = curr.fetchone()
            return jobs
    finally:
        conn.close()
