# Processa e anonimiza a base de questionários para publicação no site.
# Entrada: data/questionarios_clean.rds + data/dicionario.xlsx (XLSForm)
# Saida:   site/data/*.json (consumidos pelo dashboard estatico)
#          data/derived/*.csv (planilhas de apoio / auditoria da equipe)

library(readxl)
library(dplyr)
library(tidyr)
library(stringr)
library(purrr)
library(jsonlite)

dir.create("data/derived", showWarnings = FALSE, recursive = TRUE)
dir.create("site/data", showWarnings = FALSE, recursive = TRUE)

df   <- readRDS("data/questionarios_clean.rds")
surv <- read_excel("data/dicionario.xlsx", sheet = "survey")
chs  <- read_excel("data/dicionario.xlsx", sheet = "choices")

## ---------------------------------------------------------------------
## 1. Metadados do formulario (dicionario) -------------------------------
## ---------------------------------------------------------------------

section_titles <- c(
  "1" = "Perfil da familia e condicao socioeconomica",
  "2" = "Fontes de renda e producao",
  "3" = "Area agropecuaria e producao animal",
  "4" = "Uso de recursos naturais",
  "5" = "Percepcao sobre mudancas climaticas",
  "6" = "Impactos de eventos climaticos extremos",
  "7" = "Adaptacao, mitigacao e politicas publicas",
  "8" = "Bioeconomia"
)

## Secao e' herdada sequencialmente pela ordem das linhas do formulario:
## um campo dentro de um "begin repeat" (ex: composicao da familia, 1.5)
## nao tem numero proprio no rotulo, mas deve herdar a secao do bloco.
surv_ordered <- surv %>% filter(!is.na(name))
current_section <- NA_character_
section_col <- character(nrow(surv_ordered))
for (i in seq_len(nrow(surv_ordered))) {
  lbl <- surv_ordered$label[i]
  if (!is.na(lbl)) {
    num <- str_extract(str_trim(lbl), "^[0-9]+")
    if (!is.na(num) && num %in% names(section_titles)) current_section <- section_titles[[num]]
  }
  section_col[i] <- current_section
}
surv_ordered$section <- section_col

surv_meta <- surv_ordered %>%
  transmute(
    name  = name,
    label = label,
    type_raw = type,
    section = section
  ) %>%
  mutate(
    qtype = str_extract(type_raw, "^[a-z_]+"),
    list_name = str_trim(str_remove(type_raw, "^(select_one|select_multiple)\\s+")),
    list_name = ifelse(qtype %in% c("select_one", "select_multiple"), list_name, NA)
  )

choice_lookup <- chs %>%
  filter(!is.na(list_name)) %>%
  transmute(list_name, value = as.character(value), label = as.character(label))

decode_one <- function(list_name, value) {
  if (is.na(value)) return(NA_character_)
  hit <- choice_lookup$label[choice_lookup$list_name == list_name & choice_lookup$value == as.character(value)]
  if (length(hit) == 0) return(as.character(value))
  hit[1]
}

## ---------------------------------------------------------------------
## 2. Normalizacao de municipio / assentamento (texto livre e sujo) -----
## ---------------------------------------------------------------------

municipio_map <- c(
  "agua do azul do norte" = "Agua Azul do Norte",
  "agua azul do norte"    = "Agua Azul do Norte",
  "maraba ma"             = "Maraba",
  "maraba pa"             = "Maraba",
  "maraba"                = "Maraba",
  "pau d arcos"           = "Pau D'Arco",
  "pau d arco"            = "Pau D'Arco",
  "pau darco"             = "Pau D'Arco",
  "romdon do para"        = "Rondon do Para",
  "rondon do pa"          = "Rondon do Para",
  "rondon pa"             = "Rondon do Para",
  "rondon do para"        = "Rondon do Para",
  "rondon"                = "Rondon do Para",
  "canaa"                 = "Canaa dos Carajas",
  "canaa dos carajas"     = "Canaa dos Carajas",
  "parauapebas"           = "Parauapebas",
  "cameta"                = "Cameta",
  "cameta pa"             = "Cameta"
)

assentamento_map <- c(
  "3 ilhas"                       = "PA 3 Ilhas",
  "pa tres ilhas"                 = "PA 3 Ilhas",
  "pa 3 ilhas"                    = "PA 3 Ilhas",
  "pds porto seguro"              = "PDS Porto Seguro",
  "psd porto seguro"              = "PDS Porto Seguro",
  "pds porgo seguro"              = "PDS Porto Seguro",
  "dina teixeira"                 = "Dina Teixeira",
  "dna teixeira"                  = "Dina Teixeira",
  "dina texeira"                  = "Dina Teixeira",
  "nova vitoria"                  = "Nova Vitoria",
  "nova viroria"                  = "Nova Vitoria",
  "pa nova vitoria"               = "Nova Vitoria",
  "assentamento nova vitoria"     = "Nova Vitoria",
  "jacare xingu"                  = "Jacare Xingu",
  "ilha de jacare xingu"          = "Jacare Xingu",
  "jane julia"                    = "Jane Julia",
  "jane julia fazenda sta lucia"  = "Jane Julia",
  "palmares ii"                   = "Palmares II",
  "palmares 2"                    = "Palmares II",
  "palmares"                      = "Palmares (nao identificado)",
  "deus te ama"                   = "Deus Te Ama",
  "rio furtados"                  = "Rio Furtados",
  "furtado"                       = "Rio Furtados",
  "mendarucu de cima"             = "Rio Mendarucu de Cima",
  "rio mendarucu de cima"         = "Rio Mendarucu de Cima",
  "rio mendarucu"                 = "Rio Mendarucu (nao identificado)",
  "americo santana"               = "Americo Santana",
  "uniao americo santana"         = "Uniao Americo Santana",
  "joroca"                        = "Joroca",
  "joroca grande"                 = "Joroca Grande",
  "joroca de cima"                = "Joroca de Cima",
  "itanduba"                      = "Itanduba",
  "santa lucia"                   = "Santa Lucia",
  "uniao da vitoria"              = "Uniao da Vitoria",
  "cameta pa"                     = "Nao identificado (registro inconsistente)"
)

df <- df %>%
  mutate(
    municipio    = unname(municipio_map[municipio_chave]),
    assentamento = unname(assentamento_map[assentamento_chave])
  )

# Crosswalk exportado para auditoria da equipe de pesquisa
crosswalk <- df %>%
  count(municipio_chave, municipio, assentamento_chave, assentamento, sort = TRUE)
write.csv(crosswalk, "data/derived/crosswalk_localidades.csv", row.names = FALSE, fileEncoding = "UTF-8")

## ---------------------------------------------------------------------
## 3. Resolucao de campos expandidos de blocos de repeticao --------------
## ---------------------------------------------------------------------
## Campos dentro de "begin repeat" (ex: tipo_animal_criacao) aparecem na
## base como tipo_animal_criacao_1, tipo_animal_criacao_2 ... Uma coluna
## suspeita e' tratada como "instancia de repeticao" do campo-molde
## somente quando o nome-base (sem sufixo numerico) existe no dicionario
## MAS nao existe como coluna na base -- isso distingue repeticoes de
## colunas indicadoras binarias de select_multiple (onde o nome-base
## permanece presente como a coluna combinada).

meta_names <- surv_meta$name
df_names_all <- names(df)

resolve_base <- function(colname) {
  if (colname %in% meta_names) return(list(base = colname, instance = NA_character_))
  m <- str_match(colname, "^(.+)_([0-9]+)$")
  if (!is.na(m[1, 2])) {
    base <- m[1, 2]
    if (base %in% meta_names && !(base %in% df_names_all)) {
      return(list(base = base, instance = m[1, 3]))
    }
  }
  list(base = NA_character_, instance = NA_character_)
}

resolved <- map_dfr(df_names_all, function(cn) {
  r <- resolve_base(cn)
  tibble(colname = cn, base = r$base, instance = r$instance)
})
resolved <- resolved %>%
  left_join(surv_meta %>% select(name, qtype, list_name, label, section),
            by = c("base" = "name"))

## ---------------------------------------------------------------------
## 4. Identificadores diretos a remover (privacidade) --------------------
## ---------------------------------------------------------------------

direct_identifiers <- c(
  "SubmissionDate", "starttime", "endtime",
  "deviceid", "devicephonenum", "username", "device_info", "caseid",
  "coordenadas_qualidade", "coordenadas_latitude", "coordenadas_longitude",
  "coordenadas_altitude", "coordenadas_tipo_coordenada",
  "nome_entrevistado", "data_nascimento_entrevistado", "data_nascimento",
  "local_nascimento_entrevistado",
  "instanceID", "formdef_version", "KEY",
  "municipio_entrevista", "assentamento_origem",
  "municipio_original", "assentamento_original",
  "municipio_chave", "assentamento_chave",
  "texto_mudanca"
)

# duplicatas dos _label ja cobertas pela decodificacao das colunas originais
redundant_labels <- c("sexo_label", "raca_label", "civil_label", "escol_label", "renda_label")

keep_text_whitelist <- c("municipio", "assentamento")

# campos de texto livre (diretos OU expandidos de repeticao), exceto whitelist
free_text_cols <- resolved %>%
  filter(qtype == "text", !colname %in% keep_text_whitelist) %>%
  pull(colname)

drop_cols <- unique(c(direct_identifiers, redundant_labels, free_text_cols))
drop_cols <- intersect(drop_cols, names(df))

clean <- df %>% select(-all_of(drop_cols))
resolved <- resolved %>% filter(colname %in% names(clean))

## ---------------------------------------------------------------------
## 5. Decodificacao de select_one / select_multiple ----------------------
## ---------------------------------------------------------------------

decode_select_one_col <- function(raw, ln) {
  vals <- ifelse(is.na(raw), NA_character_, as.character(suppressWarnings(round(as.numeric(raw)))))
  fallback <- as.character(raw)
  map2_chr(vals, fallback, function(v1, fb) {
    if (is.na(v1)) return(NA_character_)
    hit <- choice_lookup$label[choice_lookup$list_name == ln & choice_lookup$value == v1]
    if (length(hit) == 0) return(fb)
    hit[1]
  })
}

decode_select_multiple_col <- function(raw, ln) {
  map_chr(raw, function(x) {
    if (is.na(x) || str_trim(x) == "") return(NA_character_)
    codes <- str_split(str_trim(x), "\\s+")[[1]]
    labs <- map_chr(codes, ~ {
      hit <- choice_lookup$label[choice_lookup$list_name == ln & choice_lookup$value == .x]
      if (length(hit) == 0) .x else hit[1]
    })
    paste(labs, collapse = "; ")
  })
}

# select_one: coluna direta (name == base, instance NA) OU instancia de repeticao
select_one_cols <- resolved %>% filter(qtype == "select_one") %>% pull(colname)
for (v in select_one_cols) {
  ln <- resolved$list_name[resolved$colname == v][1]
  clean[[v]] <- decode_select_one_col(clean[[v]], ln)
}

# select_multiple: so a coluna combinada (base == colname, texto com codigos
# separados por espaco); colunas indicadoras <base>_<valor> ficam como 0/1
select_multiple_base_cols <- resolved %>%
  filter(qtype == "select_multiple", colname == base) %>%
  pull(colname)
for (v in select_multiple_base_cols) {
  ln <- resolved$list_name[resolved$colname == v][1]
  clean[[v]] <- decode_select_multiple_col(clean[[v]], ln)
}

# instancias de repeticao de select_multiple (raras, mas tratadas por completude)
select_multiple_repeat_cols <- resolved %>%
  filter(qtype == "select_multiple", colname != base) %>%
  pull(colname)
for (v in select_multiple_repeat_cols) {
  ln <- resolved$list_name[resolved$colname == v][1]
  clean[[v]] <- decode_select_multiple_col(clean[[v]], ln)
}

select_multiple_vars <- select_multiple_base_cols

## ---------------------------------------------------------------------
## 5b. Recodifica flags derivadas 0/1 para Sim/Nao (legibilidade) --------
## ---------------------------------------------------------------------

binary_flag_cols <- c("chefe_mulher", "bolsa_familia", "aposentadoria",
                       "nenhum_prog", "recebe_algum_programa", "presenca_criancas")
for (v in intersect(binary_flag_cols, names(clean))) {
  clean[[v]] <- ifelse(is.na(clean[[v]]), NA_character_,
                        ifelse(as.numeric(clean[[v]]) == 1, "Sim", "Nao"))
}

## ---------------------------------------------------------------------
## 5c. ID sintetico do respondente -----------------------------------------
## ---------------------------------------------------------------------

clean <- clean %>%
  mutate(id_pesquisa = sprintf("R%03d", row_number())) %>%
  select(id_pesquisa, everything())

## ---------------------------------------------------------------------
## 6. Catalogo de variaveis (para a interface dinamica) -------------------
## ---------------------------------------------------------------------

derived_labels <- c(
  tamanho_dom = "Tamanho do domicilio (n. pessoas)",
  n_criancas = "Numero de criancas no domicilio",
  n_adultos = "Numero de adultos no domicilio",
  presenca_criancas = "Presenca de criancas no domicilio",
  razao_dependencia = "Razao de dependencia",
  dep_tercil = "Tercil de razao de dependencia",
  tam_grupo = "Grupo por tamanho da familia",
  criancas_grupo = "Grupo por numero de criancas",
  dep_grupo = "Grupo por razao de dependencia",
  data_entrevista = "Data da entrevista",
  idade_calculada = "Idade calculada (anos)",
  idade = "Idade (anos)",
  faixa_etaria = "Faixa etaria",
  chefe_mulher = "Chefia feminina da familia",
  bolsa_familia = "Recebe Bolsa Familia",
  aposentadoria = "Recebe aposentadoria",
  nenhum_prog = "Nao recebe nenhum programa social",
  recebe_algum_programa = "Recebe algum programa social",
  ano_referencia = "Ano de referencia da pesquisa",
  ano_entrada_informado = "Ano informado de entrada no assentamento",
  anos_informados = "Anos de residencia informados",
  ano_entrada = "Ano de entrada no assentamento",
  tempo_assent = "Tempo no assentamento (anos)",
  tempo_grupo = "Grupo por tempo no assentamento",
  area_grupo = "Grupo por area do lote",
  municipio = "Municipio",
  assentamento = "Assentamento"
)

classify_type <- function(colname, rcol) {
  if (is.numeric(rcol)) return("numeric")
  if (inherits(rcol, "Date")) return("date")
  if (is.factor(rcol) || is.character(rcol)) return("categorical")
  "categorical"
}

## Colunas indicadoras binarias dos select_multiple (ex: programa_social_familia_1)
## sao calculadas primeiro para que NAO caiam no loop generico abaixo.
indicator_catalog <- map_dfr(select_multiple_vars, function(v) {
  ln <- surv_meta$list_name[surv_meta$name == v][1]
  opts <- choice_lookup %>% filter(list_name == ln)
  map_dfr(seq_len(nrow(opts)), function(i) {
    colname <- paste0(v, "_", opts$value[i])
    if (!colname %in% names(clean)) return(NULL)
    base_label <- surv_meta$label[surv_meta$name == v][1]
    tibble(id = colname, label = paste0(base_label, " = ", opts$label[i]),
           section = surv_meta$section[surv_meta$name == v][1],
           type = "binary", parent = v)
  })
})
indicator_ids <- indicator_catalog$id

catalog <- map_dfr(setdiff(names(clean), indicator_ids), function(v) {
  if (v == "id_pesquisa") return(NULL)
  meta_row <- resolved[resolved$colname == v, ]
  is_multi <- v %in% select_multiple_vars
  base_label <- if (nrow(meta_row) > 0 && !is.na(meta_row$label[1])) meta_row$label[1]
                else if (v %in% names(derived_labels)) unname(derived_labels[v])
                else v
  instance <- if (nrow(meta_row) > 0) meta_row$instance[1] else NA_character_
  label <- if (!is.na(instance)) paste0(base_label, " — item ", instance) else base_label
  section <- if (nrow(meta_row) > 0 && !is.na(meta_row$section[1])) meta_row$section[1]
             else if (v %in% c("municipio", "assentamento")) "Identificacao e localizacao"
             else if (v %in% names(derived_labels)) "Indicadores derivados"
             else "Outros"
  tibble(
    id = v,
    label = label,
    section = section,
    type = if (is_multi) "multiple" else classify_type(v, clean[[v]])
  )
})

catalog$parent <- NA_character_
full_catalog <- bind_rows(catalog, indicator_catalog)
full_catalog <- full_catalog[!duplicated(full_catalog$id), ]

## ---------------------------------------------------------------------
## 7. Export --------------------------------------------------------------
## ---------------------------------------------------------------------

# datas como string ISO para JSON
clean <- clean %>% mutate(across(where(~ inherits(.x, "Date")), as.character))
clean <- clean %>% mutate(across(where(is.factor), as.character))

write_json(full_catalog, "site/data/catalog.json", auto_unbox = TRUE, na = "null")
write_json(clean, "site/data/respondents.json", auto_unbox = TRUE, na = "null", dataframe = "rows")

cat("OK -> site/data/catalog.json (", nrow(full_catalog), "variaveis )\n")
cat("OK -> site/data/respondents.json (", nrow(clean), "respondentes x", ncol(clean), "colunas )\n")
cat("OK -> data/derived/crosswalk_localidades.csv (para revisao da equipe)\n")

## ---------------------------------------------------------------------
## 8. Dicionario de dados (pagina publica) --------------------------------
## ---------------------------------------------------------------------
## Reaproveita as tabelas ja resolvidas acima (surv_meta, resolved,
## indicator_catalog, choice_lookup, full_catalog) para publicar, por
## variavel do catalogo: o tipo bruto do formulario (select_one, integer...)
## e -- quando aplicavel -- a lista completa de opcoes de resposta validas
## (nao apenas as que apareceram nas entrevistas).

qtype_by_name    <- setNames(surv_meta$qtype, surv_meta$name)
listname_by_name <- setNames(surv_meta$list_name, surv_meta$name)

choices_for_list <- function(ln) {
  if (is.na(ln)) return(NULL)
  rows <- choice_lookup[choice_lookup$list_name == ln, ]
  if (nrow(rows) == 0) return(NULL)
  purrr::map2(rows$value, rows$label, function(v, l) list(value = v, label = l))
}

base_for_id <- function(vid) {
  hit <- resolved$base[resolved$colname == vid]
  if (length(hit) && !is.na(hit[1])) return(hit[1])
  hit2 <- indicator_catalog$parent[indicator_catalog$id == vid]
  if (length(hit2)) return(hit2[1])
  vid
}

dictionary_list <- purrr::map(full_catalog$id, function(vid) {
  base <- base_for_id(vid)
  qtype <- unname(qtype_by_name[base])
  ln <- unname(listname_by_name[base])
  list(
    label = full_catalog$label[full_catalog$id == vid][1],
    section = full_catalog$section[full_catalog$id == vid][1],
    type = full_catalog$type[full_catalog$id == vid][1],
    type_raw = if (length(qtype) && !is.na(qtype)) qtype else NULL,
    choices = choices_for_list(ln)
  )
})
names(dictionary_list) <- full_catalog$id

write_json(dictionary_list, "site/data/dictionary.json", auto_unbox = TRUE, na = "null", null = "null")
cat("OK -> site/data/dictionary.json (", length(dictionary_list), "variaveis )\n")
