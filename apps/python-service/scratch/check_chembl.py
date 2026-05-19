from chembl_webresource_client.new_client import new_client

def search_target(target_name):
    target = new_client.target
    res = target.filter(pref_name__icontains=target_name, organism="Homo sapiens", target_type="SINGLE PROTEIN")
    for r in res:
        print(f"Name: {r['pref_name']}, ID: {r['target_chembl_id']}, Type: {r['target_type']}")

print("Searching for Butyrylcholinesterase...")
search_target("Butyrylcholinesterase")
print("\nSearching for BCHE...")
search_target("BCHE")
