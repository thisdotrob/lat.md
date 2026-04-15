# Bedrock embedding models for lat.md semantic search

This report ranks **five Amazon Bedrock embedding models** by suitability for **this repository**: batch indexing of markdown section text, `InvokeModel` via `@aws-sdk/client-bedrock-runtime`, libsql **fixed-width** vectors (`F32_BLOB` + hardcoded `BEDROCK_EMBEDDING_DIMENSIONS`), and the goal of **IAM parity with Anthropic Claude** profiles (Bedrock model access + `bedrock:InvokeModel`, without recurring **AWS Marketplace** subscription IAM where possible).

**Current implementation (baseline):** `src/search/embeddings.ts` uses the **Cohere Embed on Bedrock** request shape (`texts`, `input_type`, `embedding_types`) and expects **`embeddings.float`** in the response. `src/config.ts` hardcodes an **application inference profile ARN** and **`BEDROCK_EMBEDDING_DIMENSIONS`** (today `1536` for Cohere Embed v4). Batching uses **`BEDROCK_MAX_BATCH = 96`** aligned with Cohere limits.

---

## Ranking summary

| Rank | Model | Model ID (typical) | API family | First-party / Marketplace-style friction |
| ---: | --- | --- | --- | --- |
| 1 | **Amazon Titan Text Embeddings V2** | `amazon.titan-embed-text-v2:0` | Titan | First-party (same class as Anthropic for access) |
| 2 | **Amazon Titan Embeddings G1 – Text** | `amazon.titan-embed-text-v1` | Titan | First-party |
| 3 | **Cohere Embed v4** | `cohere.embed-v4:0` (often via inference profile ARN) | Cohere | Higher friction (Marketplace-style errors common) |
| 4 | **Cohere Embed – English v3** | `cohere.embed-english-v3` | Cohere | Same family as #3 |
| 5 | **Cohere Embed – Multilingual v3** | `cohere.embed-multilingual-v3` | Cohere | Same family as #3; better if `lat.md/` is multilingual |

---

## 1. Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`)

**Suitability:** Highest for this project if you want **the same practical permission story as Anthropic** on Bedrock: AWS first-party model, strong fit for RAG/semantic search, configurable output width.

### Permissions / AWS configuration

- **IAM:** `bedrock:InvokeModel` (and optionally `bedrock:ListFoundationModels` for tooling) on the chosen resource (inference profile ARN, foundation-model ARN, or `*` per org standards).
- **Bedrock console:** Enable **model access** for Titan Text Embeddings V2 in the account/region you use (same workflow class as Claude).
- **Marketplace:** Generally **not** the same third-party Marketplace IAM path as Cohere; align with your org’s Bedrock model-access policy for **Amazon** models.
- **Region:** Confirm availability in your target region (e.g. `us-east-1`) in the [supported models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) table.

### Project changes (hardcode only this model)

1. **`src/config.ts`**
   - Set `BEDROCK_EMBEDDING_MODEL_ARN` to your Titan v2 **foundation model ID** or a **Bedrock inference profile ARN** that points at Titan v2 (same pattern as today’s profile ARN).
   - Set `BEDROCK_EMBEDDING_DIMENSIONS` to **`1024`**, **`512`**, or **`256`** only (per [Titan Embeddings request/response](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-embed-text.html)); it must match the `dimensions` you send in every request.

2. **`src/search/embeddings.ts`**
   - Replace the Cohere `body` with Titan v2 JSON: required **`inputText`** (single string per `InvokeModel` call in AWS examples), optional **`dimensions`**, **`normalize`**, **`embeddingTypes`** (e.g. `["float"]`).
   - Replace response parsing: Titan v2 returns **`embedding`** and/or **`embeddingsByType.float`**, **not** `embeddings.float` arrays of batches.
   - **Batching:** Titan examples are **one text per request**. Your indexer passes batches of sections; implement either **sequential** `InvokeModel` per text or a small **concurrency pool**. Remove or redefine `BEDROCK_MAX_BATCH` (96 is Cohere-specific).

3. **`src/search/provider.ts`**
   - No structural change if dimensions stay driven from `BEDROCK_EMBEDDING_DIMENSIONS`.

4. **Tests / fixtures**
   - RAG replay tests: regenerate or replace `tests/cases/rag/replay-data` for new dimensions and response shape if you keep replay-based tests.
   - Update any assertions on embedding width (`tests/search.test.ts`, replay manifest).

5. **`lat.md/cli.md` (and templates if they mention Cohere-only behaviour)**
   - Document Titan request/response and per-item embedding calls instead of Cohere batching.

---

## 2. Amazon Titan Embeddings G1 – Text (`amazon.titan-embed-text-v1`)

**Suitability:** Very high for **minimal IAM surprise** and a **fixed 1536-dimensional** float vector (matches your **current** `BEDROCK_EMBEDDING_DIMENSIONS = 1536` constant, so dimension config may stay unchanged—still verify in your account).

### Permissions / AWS configuration

- Same broad pattern as **#1**: Bedrock model access + `bedrock:InvokeModel`; **Amazon** first-party model.
- **Region / access:** Confirm model ID and access in your region.

### Project changes (hardcode only this model)

1. **`src/config.ts`**
   - Hardcode `BEDROCK_EMBEDDING_MODEL_ARN` to the v1 model ID or an inference profile ARN for v1.
   - Keep **`BEDROCK_EMBEDDING_DIMENSIONS = 1536`** only if v1’s output size still matches (confirm against AWS docs for your exact endpoint).

2. **`src/search/embeddings.ts`**
   - Request body: **`{ "inputText": "<single section text>" }`** only (G1 shape per AWS docs).
   - Response: top-level **`embedding`** array (not `embeddings.float`).
   - **Batching:** One `InvokeModel` per section text (loop or pool), same as Titan v2 from an implementation perspective.

3. **Tests / docs:** Same class of updates as for Titan v2.

**Trade-off vs v2:** Fewer tuning knobs (no `dimensions` choice on v1 in the same way as v2); quality/latency may differ; long-term AWS may steer new workloads to v2.

---

## 3. Cohere Embed v4 (`cohere.embed-v4:0` / application inference profile)

**Suitability:** **Highest for “no code path change”**—this is what the repo is **already wired for**. Lowest for **permission simplicity** if your org hits **Marketplace** subscription/IAM errors.

### Permissions / AWS configuration

- **IAM:** `bedrock:InvokeModel` on the profile or model ARN.
- **Bedrock / Marketplace:** Cohere models are commonly exposed through flows that trigger **`aws-marketplace:ViewSubscriptions`** / **`Subscribe`** style checks. Your account may need **Marketplace subscription** for the Cohere product, **billing**, and IAM that allows those actions for the calling principal.
- **Inference profile:** Terraform can expose an `application-inference-profile/...` ARN (as in your Cleo setup); that does not remove Cohere’s commercial/access path—only how you address the model.

### Project changes (hardcode only this model)

1. **`src/config.ts`**
   - Set `BEDROCK_EMBEDDING_MODEL_ARN` to the **profile or model ARN** for Embed v4.
   - Set `BEDROCK_EMBEDDING_DIMENSIONS` to the **actual** `embeddings.float[i].length` for that endpoint (**`1536`** today for your profile).

2. **`src/search/embeddings.ts`**
   - **None** if you stay on Cohere v4 with the same API version.

3. **Everything else:** Replay fixtures and docs should describe Cohere v4 + optional Marketplace requirements honestly.

---

## 4. Cohere Embed – English v3 (`cohere.embed-english-v3`)

**Suitability:** High if you stay on the **Cohere request/response family** (same `InvokeModel` style as v4: `texts`, `input_type`, `embedding_types`, `embeddings.float`) but want an older, widely documented embedding model. **Dimensions are typically 1024** (not 1536)—must match libsql width.

### Permissions / AWS configuration

- Same **Cohere / Marketplace** class as **#3** (expect Bedrock + Marketplace-style entitlement checks in many orgs).
- Enable model access for that Cohere model ID in the Bedrock console where required.

### Project changes (hardcode only this model)

1. **`src/config.ts`**
   - Hardcode ARN/model id for **English v3**.
   - Set `BEDROCK_EMBEDDING_DIMENSIONS` to **`1024`** (verify against live `embeddings.float` once in a scratch environment).

2. **`src/search/embeddings.ts`**
   - Likely **minimal or no change** if Bedrock’s English v3 uses the same embed API surface as v4 for `InvokeModel` (confirm in [Cohere Embed on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed.html) for the exact model ID you choose).
   - Rebuild **`lat.md/.cache/vectors.db`** after dimension change (`ensureSchema` drops the table on mismatch).

3. **Tests / replay:** Regenerate replay data for **1024** dims.

---

## 5. Cohere Embed – Multilingual v3 (`cohere.embed-multilingual-v3`)

**Suitability:** Same as **#4** for code and permissions, but **better if your `lat.md/` graph is multilingual**. If documentation is **English-only**, English v3 is usually enough.

### Permissions / AWS configuration

- Identical friction class to **#3** and **#4** (Cohere on Bedrock).

### Project changes (hardcode only this model)

- Same file touch list as **#4**, with model ID switched to **`cohere.embed-multilingual-v3`** and dimensions verified (commonly **1024**—confirm for your region/endpoint).

---

## Cross-cutting notes for any switch

1. **Vectors DB:** `src/search/db.ts` stores `meta.dimensions`; changing `BEDROCK_EMBEDDING_DIMENSIONS` triggers a **table rebuild** on next index—expected.
2. **Quality:** Swapping families (Cohere ↔ Titan) changes geometry; treat **re-embed everything** + optional **evaluation** on your real `lat.md/` queries as part of the migration.
3. **Inference profile ARNs vs model IDs:** The repo already accepts **`arn:aws:bedrock:...:application-inference-profile/...`**; Titan can use the same pattern if you create profiles in Terraform for cost allocation or governance.
4. **Authoritative IDs:** Always confirm **model ID strings, regions, and output sizes** in [Supported foundation models in Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) before hardcoding.

---

## References (AWS)

- [Amazon Titan Embeddings – request/response (incl. v2)](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-embed-text.html)  
- [Cohere Embed and Cohere Embed v4 on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed.html)  
- [Subscribe to a model (Bedrock / Marketplace flows)](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-marketplace-subscribe-to-a-model.html)  
- [Supported foundation models in Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html)

---

## Repo files touched by a typical migration

| Area | Files |
| --- | --- |
| Hardcoded ARN + width | `src/config.ts` |
| `InvokeModel` body + response parsing + batching | `src/search/embeddings.ts` |
| Provider dimensions (if not only from config) | `src/search/provider.ts` |
| Automated RAG / dimensions | `tests/search.test.ts`, `tests/cases/rag/replay-data/*`, `tests/rag-replay-server.ts` (if behaviour changes) |
| Architecture docs | `lat.md/cli.md`, `README.md` (configuration blurb) |

*Generated for the lat.md codebase; validate model IDs and dimensions against your AWS account before production hardcoding.*
