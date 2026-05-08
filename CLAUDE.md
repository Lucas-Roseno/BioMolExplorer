# 🧠 Instruções Permanentes - BioMolExplorer

##  Linguagem
**Comunique-se SEMPRE em Português-BR.** O usuário prefere português para contexto técnico e casual.

---

## 📚 Obsidian como Contexto Automático

O Obsidian (`~/Documentos/Obsidian_2nd_brain/`) é o "segundo cérebro" do usuário e deve ser **SEMPRE** consultado.

### Como Usar:
1. **Identifique palavras-chave** da pergunta (projeto, tecnologia, problema)
2. Use `Glob` para procurar por `.md` relevantes em `Obsidian_2nd_brain/`
3. Leia APENAS as notas encontradas (não tudo)
4. Integre contexto na resposta

### Quando Consultar:
- ✅ Perguntas sobre código → leia arquitetura/requisitos do projeto
- ✅ Tarefas de programação → leia contexto do BioMolExplorer
- ✅ Qualquer pergunta → use Obsidian como segunda fonte
- ⚠️ Se inacessível, prossiga normalmente

---

## 💾 Salvar no Obsidian Automaticamente

Toda informação **importante** deve ser salva. Use este processo:

### 1. Detectar Informação Nova
Identifique automaticamente quando o usuário menciona:
- Decisões técnicas (arquitetura, tecnologias)
- Bugs e soluções
- Requisitos e features
- Aprendizados e descobertas
- Problemas em andamento
- Ideias e próximos passos

### 2. Estrutura de Pastas
```
Obsidian_2nd_brain/
├── Projetos/
│   ├── BioMolExplorer/
│   │   ├── Arquitetura.md
│   │   ├── Bugs_Resolvidos.md
│   │   ├── Features.md
│   │   ├── Ideias.md
│   │   └── Setup.md
│   ├── FullStack/
│   ├── ComfyUI/
│   └── [outros...]
├── Conceitos/
│   ├── Python.md
│   ├── JavaScript.md
│   ├── Banco_de_Dados.md
│   └── [tópicos gerais]
├── Snippets_de_Código/
├── Artigos_Lidos.md
└── Dashboard.md
```

### 3. Salvar Nova Informação
**Caminho**: `/home/lucas-roseno/Documentos/Obsidian_2nd_brain/Projetos/BioMolExplorer/[Categoria].md`

**Formato padrão**:
```markdown
# [Título]

**Data**: YYYY-MM-DD
**Projeto**: BioMolExplorer
**Tags**: #tag1 #tag2

## Contexto
[O que levou a isso]

## Solução/Decisão
[Detalhes técnicos]

## Links Relacionados
- [[Nota Relacionada]]
- [[Conceito]]

## Próximos Passos
[Se aplicável]
```

### 4. Criar Links Inteligentes
Use formato Obsidian: `[[Nome da Nota]]`
- Notas do mesmo projeto
- Conceitos/tecnologias mencionadas
- Bugs relacionados a features
- Dependências entre decisões

### 5. Quando Salvar
- ✅ Após cada sessão com informação útil
- ✅ Quando resolve bug ou implementa feature
- ✅ Quando descobre padrão ou boas práticas
- ❌ NÃO salve perguntas triviais

### 6. Antes de Salvar
1. **Busca inteligente**: Procure notas existentes (não leia TUDO)
2. Evite duplicatas
3. Atualize notas relacionadas com links
4. Mantenha formatação consistente
5. Use tags para facilitar buscas

---

## 📋 Espaço de Trabalho Atual
- **Diretório**: `/home/lucas-roseno/CEFET/BioMolExplorer`
- **Branch Atual**: test-files
- **Branch Principal**: main

---

## 🔄 Fluxo de Trabalho
1. **Leia o Obsidian** no início de cada pergunta (contexto automático)
2. **Resolva o problema**
3. **Salve aprendizados** no Obsidian (automaticamente)
4. **Comunique em Português**

---

## ⚠️ Avisos Importantes
- Se Obsidian estiver inacessível, continue normalmente (não interrompa)
- Mantenha formatação Markdown consistente
- Use `git log` para verificar histórico recente, não Obsidian
- Código deve estar comentado em Português onde relevante
- Respeite a memória do projeto (não reescreva instruções que já existem)
