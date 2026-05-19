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
from chembl_webresource_client.new_client import new_client as client
#----------------------------------------------------------------------------------------------

class CrawlerSettings:

    def __init__(self):
        """
        1. `CACHING`: A boolean flag that indicates whether caching is enabled. When set to `True`,  
        API requests to ChEMBL will be cached for future queries. The default value is `False`.  

        2. `FAST_SAVE`: A boolean flag that indicates whether fast save mode is enabled. When set to `True`,  
        operations such as record insertion and updating will be performed more quickly. The default value is `False`.  

        3. `TOTAL_RETRIES`: The total number of retry attempts for a failed request to the ChEMBL API.  
        The default value is `3`.  

        4. `BACKOFF_FACTOR`: The exponential backoff factor used to calculate the delay between retry attempts in case of failure.  
        The default value is `0.3`, meaning the delay will increase exponentially with each retry.  

        5. `CONCURRENT_SIZE`: The maximum number of concurrent requests allowed. The default value is `10`.  

        6. `CACHE_EXPIRE`: The expiration time (in seconds) for cached items. The default value is `60`,  
        meaning items will be stored in the cache for 60 seconds.  

        7. `CACHE_NAME`: The name of the cache to be used. The default value is `'chembl_webresource_client_cache'`.  

        8. `RESPECT_RATE_LIMIT`: A boolean flag that determines whether the ChEMBL API rate limit should be respected.  
        When set to `True`, the library will introduce pauses between requests to avoid exceeding the rate limit.  
        The default value is `False`.  

        9. `TIMEOUT`: The maximum waiting time (in seconds) for receiving a response from the API. The default value is `120` seconds.  

        10. `NEW_CLIENT_TIMEOUT`: The maximum waiting time (in seconds) to initialize a new client instance.  
            The default value is `300` seconds.  

        11. `TEST_CASE_TIMEOUT`: The maximum waiting time (in seconds) for test cases to complete.  
            The default value is `600` seconds.  

        12. `MAX_LIMIT`: The maximum number of records that can be returned by a single query to the ChEMBL API.  
            The default value is `1000`.  

        13. `REPR_OUTPUT_SIZE`: The maximum size of the output displayed in the string representation of an object.  
            The default value is `100`.  

        14. `MAX_URL_SIZE`: The maximum allowed length for a request URL. The default value is `8000`.  

        15. `PROXIES`: A dictionary of proxy settings to be used for requests. The default value is `None`.  

        """

        Settings.Instance().CACHING = False
        Settings.Instance().FAST_SAVE = True
        Settings.Instance().RESPECT_RATE_LIMIT = False
        Settings.Instance().TOTAL_RETRIES = 10
        Settings.Instance().TIMEOUT = 86400
        Settings.Instance().CONCURRENT_SIZE = 50
        Settings.Instance().CACHE_EXPIRE = 60 * 60 * 24
        Settings.Instance().CACHE_NAME = 'PhD.UFSJ'
        Settings.Instance().TIMEOUT = 86400
        Settings.Instance().MAX_LIMIT = 1000000
        Settings.Instance().MAX_URL_SIZE = 1000000

        self.client = client
        

    def get_client_connection(self):
        return self.client

