from kernel.metadata import (
    PROJECT_NAME,
    PROJECT_DESCRIPTION,
    PROJECT_INFO,
    AUTHORS,
    LICENSE,
    DATE,
    MAINTAINER,
    RESEARCH_PERIOD,
    FRAMEWORK_CATEGORY
)


class HeaderBuilder:

    @staticmethod
    def build(
        module_title: str,
        module_description: str = "",
        module_version: str = "1.0.0"
    ) -> str:

        authors = "\n".join(
            [f"   - {author}" for author in AUTHORS]
        )

        categories = "\n".join(
            [f"   - {category}" for category in FRAMEWORK_CATEGORY]
        )

        return f'''"""
!===========================================================
{PROJECT_NAME}
===========================================================

{RESEARCH_PERIOD}

Extending module, maintained and developed by
{MAINTAINER}

@title
    {PROJECT_NAME}

@module
    {module_title}

@description
    {module_description}

@version
    {module_version}

@framework_description
    {PROJECT_DESCRIPTION}

@info
    {PROJECT_INFO}

@framework_category
{categories}

@authors
{authors}

@date
    {DATE}

@copyright
    {LICENSE}

@cond MIT_LICENSE

    BioMolExplorer is free software: you can redistribute
    it and/or modify it under the terms of the MIT License
    as published by the Massachusetts Institute of Technology.

    Permission is hereby granted, free of charge, to any
    person obtaining a copy of this software and associated
    documentation files (the "Software"), to deal in the
    Software without restriction, including without
    limitation the rights to use, copy, modify, merge,
    publish, distribute, sublicense, and/or sell copies
    of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the
    following conditions:

    The above copyright notice and this permission notice
    shall be included in all copies or substantial portions
    of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
    ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
    TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
    PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
    SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
    ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
    ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
    OR OTHER DEALINGS IN THE SOFTWARE.

@endcond

"""'''