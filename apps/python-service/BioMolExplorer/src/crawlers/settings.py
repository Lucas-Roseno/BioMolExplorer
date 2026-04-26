"""!

PhD research 2023~2026

@title 
    BioMolExplorer: a general framework based on a target-ligand strategy to investigate the 
    physicochemical potential of compounds through information retrieval and pre-processing 
    molecular data.

@info
    A general crawler to look at targets and bioactive molecules on the ChEMBL database.

@authors 
   - Michel Pires da Silva (michel@cefetmg.br / Academic student)
   - Alisson Marques da Silva (alisson@cefetmg.br / Co Advisor)
   - Alex Gutterres Taranto   (taranto@ufsj.edu.br / Advisor)

@date 2023-2026

@copyright MIT License

@cond MIT_LICENSE
    BioMolExplorer is free software: you can redistribute it and/or modify
    it under the terms of the MIT License as published by
    the Massachusetts Institute of Technology.
    
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
@endcond

"""
#----------------------------------------------------------------------------------------------
from chembl_webresource_client.settings import Settings
#----------------------------------------------------------------------------------------------

class CrawlerSettings:

    def __init__(self):
        self.Settings = Settings
        self._client = None
        self.Settings.Instance().CACHING = False
        self.Settings.Instance().FAST_SAVE = True
        self.Settings.Instance().RESPECT_RATE_LIMIT = False
        self.Settings.Instance().TOTAL_RETRIES = 10
        self.Settings.Instance().TIMEOUT = 86400
        self.Settings.Instance().CONCURRENT_SIZE = 50
        self.Settings.Instance().CACHE_EXPIRE = 60 * 60 * 24
        self.Settings.Instance().CACHE_NAME = 'PhD.UFSJ'
        self.Settings.Instance().MAX_LIMIT = 1000000
        self.Settings.Instance().MAX_URL_SIZE = 1000000


    def get_client_connection(self):
        if self._client is None:
            try:
                from chembl_webresource_client.new_client import new_client
                self._client = new_client
            except Exception as e:
                print(f"Warning: ChEMBL client could not be initialized (EBI might be down): {e}")
                self._client = None
        return self._client
