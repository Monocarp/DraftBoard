
from supabase import create_client

SUPABASE_URL = "https://cmapsylsrsglhfdwquwe.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYXBzeWxzcnNnbGhmZHdxdXdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExNDM3NywiZXhwIjoyMDg2NjkwMzc3fQ.nJfRUDGB-l-KawRzimGJVcsNq03N0Gn1yYl_ZhWvYrc"

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

resp = sb.table("commentary").select("id, source, sections").like("source", "%PFF%").limit(10).execute()
for r in resp.data:
    print(r)

resp2 = sb.table("commentary").select("source", count="exact").execute()
# just get distinct sources
resp3 = sb.table("commentary").select("source").execute()
sources = set(r["source"] for r in resp3.data)
print("Distinct sources in commentary:", sources)

