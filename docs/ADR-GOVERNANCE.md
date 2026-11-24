# ADR Governance — MADR v4 + hve-core

Tài liệu này mô tả cách `project/fde/adr/` được quản lý, sau khi áp chuẩn của hai repo tham chiếu:

- `khanhlegood1/architecture-decisions` (Factory-X) — hệ ADR dạng Docusaurus: tách **Network ADR** và **Use-Case ADR**, ADR graph, contract section bắt buộc (Problem / Context / Decision / Consequences / Alternatives).
- `khanhlegood1/hve-core` — `adr-standards.instructions.md`: MADR **v4.0.0** (CC0) làm frontmatter chuẩn, taxonomy 6 trạng thái với transition hợp lệ, đặt tên `NNNN-kebab-case-title.md` (GP-16), supersession hai chiều, `asr_triggers`, và quy tắc **personas-not-people**.

Điểm khác biệt có chủ đích: Game9K giữ **file phẳng** `NNNN-slug.md` (GP-16) thay vì folder `adrNNN-<slug>/README.md` của Factory-X, vì repo này CLI-first và cần `git diff` gọn. Các luật còn lại của Factory-X (type, section bắt buộc, graph, roles) vẫn được áp.

## 1. Nguồn sự thật

| Thứ | Ở đâu | Ghi chú |
| --- | --- | --- |
| Quyết định | `project/fde/adr/NNNN-kebab-case-title.md` | Mỗi file là một ADR, frontmatter MADR v4 |
| Cấu hình bộ ADR | `project/fde/adr/.adr-config.yml` | `last_decision_id`, `template_source`, `graph_layout` |
| Template | `project/fde/adr/_template.md` | Không tính là ADR (`_`-prefix bị bỏ qua) |
| Bộ đọc/kiểm luật | `src/lib/adrRegistry.js` | Registry duy nhất; portal, CLI và CI cùng dùng |
| Hiển thị | `/tasks.html` → **Decision Logs** | lifecycle, lineage, findings, graph |

**ADR là read model.** Không có database thứ hai cho quyết định: sửa file = sửa bộ ADR, mọi nơi khác tự cập nhật.

## 2. Frontmatter bắt buộc

```yaml
---
id: "0003"
title: "Mô tả ngắn quyết định"
description: "Một câu: quyết định đổi gì và vì sao quan trọng"
type: "network"            # network | use-case
status: "proposed"         # proposed | accepted | rejected | deprecated | superseded | withdrawn
date: "2026-11-23"
proposed_date: "2026-11-20"
accepted_date: null
deciders: ["Studio Engineering"]
consulted: ["Live Ops"]
informed: ["Creator Success"]
affected_components: ["src/lib/scheduleBoard.js"]
related: ["0001"]
tags: ["adr", "schedule"]
supersedes: null
superseded-by: null
asr_triggers:
  - kind: "maintainability"
    evidence: "project/fde/schedule.json"
    note: "Lịch họp phải đọc được bằng mắt, không qua UI."
---
```

`type` theo Factory-X: **network** = hạ tầng/protocol/dữ liệu dùng chung; **use-case** = luồng nghiệp vụ có API/SDK riêng.

## 3. Vòng đời và transition hợp lệ

```
proposed ──► accepted ──► deprecated ──► superseded
    │            │
    ├──► rejected│
    └──► withdrawn
```

- `rejected`, `withdrawn`, `superseded` là **trạng thái cuối** — không quay lại.
- ADR đã `accepted` chỉ đổi trạng thái khi **deprecate** hoặc **supersede** bằng một ADR mới.
- `src/lib/adrRegistry.js` export `ADR_TRANSITIONS` để CLI (`g9k adr list`) và portal hiển thị cùng một bảng, không có bảng luật thứ hai.
- Với portal, `open` = `proposed` + `accepted` + `deprecated` (vẫn còn hiệu lực hoặc chưa đóng); `superseded`/`rejected`/`withdrawn` được coi là đã đóng.

## 4. Supersession hai chiều

Khi ADR `0007` thay `0003`:

```yaml
# 0007
supersedes: ["0003"]
status: accepted
```

```yaml
# 0003
status: superseded
superseded-by: "0007"
```

Cả hai chiều đều bắt buộc. Thiếu một chiều → `ADR-SUPERSEDED-BY-REQUIRED`, `ADR-SUPERSEDED-BY-DANGLING` hoặc `ADR-SUPERSEDES-DANGLING` (lỗi, `npm run adr -- validate` exit 1).

## 5. Section bắt buộc

| Section | Bắt buộc | Luật |
| --- | --- | --- |
| `## Problem` | network + use-case | `ADR-SECTION-MISSING` |
| `## Context` | mọi ADR | `ADR-SECTION-MISSING` |
| `## Decision` | mọi ADR | `ADR-SECTION-MISSING` |
| `## Consequences` | mọi ADR | phải nêu ít nhất một **đánh đổi** (`ADR-CONSEQUENCE-TRADEOFF`) |
| `## Alternatives` | mọi ADR | bảng phương án bị loại + lý do |
| `## Confirmation` | khuyến nghị | cách kiểm chứng, kèm `> Source:` |
| `## Follow-ups` | khi có việc tiếp | `- \`fde-00x\`: tiêu đề` để board tự link |

`## Follow-ups` là cầu nối ADR → task board: bullet có id `fde-00x` sẽ link vào task sẵn có, không sinh task trùng.

## 6. ASR trigger

`asr_triggers` trả lời câu hỏi "khi nào phải xem lại quyết định này". `kind` là enum đóng:

`cost | performance | security | compliance | availability | scalability | maintainability | evolvability`

Mỗi trigger cần `evidence` (link, file, ticket) và `note` ≤ 280 ký tự. Thiếu/sai → `ADR-ASR-MISSING`, `ADR-ASR-KIND`, `ADR-ASR-EVIDENCE`, `ADR-ASR-NOTE-LENGTH`.

## 7. Personas, không phải người

`deciders` / `consulted` / `informed` là **vai trò hoặc team** (`Studio Engineering`, `Live Ops`, `Compliance`). Không dùng tên người, `@handle` hay email — `ADR-PERSONA-RULE` sẽ bắt. Lý do: ADR sống lâu hơn người giữ ghế.

## 8. Bộ lệnh

```bash
npm run adr                          # list: id, type, status, deciders, findings
npm run adr -- validate              # 0 error → exit 0; ngược lại exit 1 (CI gate)
npm run adr -- next --title "..."    # id kế tiếp + file name theo GP-16 (không ghi file)
npm run adr -- graph                 # nodes + edges (supersedes / superseded-by / related / shared-task)
npm run adr -- list --json           # envelope JSON cho automation
```

`next` lấy `max(last_decision_id, id lớn nhất trong thư mục) + 1`, nên không bao giờ cấp lại id đã dùng.

## 9. Khi nào bắt buộc mở ADR mới

Mở ADR khi quyết định đó:

1. thay đổi **contract** giữa hai phần của hệ (game ↔ gateway, SDK ↔ server, task board ↔ ADR);
2. **khoá** một lựa chọn mà sau này đổi sẽ tốn migration;
3. do **compliance/security** áp đặt (luôn cần `asr_triggers`);
4. ngược lại với một ADR đang `accepted` → bắt buộc `supersedes`, không sửa lịch sử.

Không mở ADR cho: đổi tên biến, format code, bump dependency — dùng commit/PR.

## 10. Checklist review (dùng cho người và AI)

- [ ] Tên file `NNNN-kebab-case-title.md`, `id` khớp số trong tên.
- [ ] `status` thuộc enum; nếu đổi trạng thái thì transition hợp lệ.
- [ ] `type` đúng (`network` vs `use-case`).
- [ ] Đủ `## Problem` / `## Context` / `## Decision` / `## Consequences` / `## Alternatives`.
- [ ] `## Consequences` có ít nhất một đánh đổi được chấp nhận.
- [ ] Supersession hai chiều nếu có.
- [ ] `deciders`, `consulted`, `informed` là vai trò, không phải người.
- [ ] Mỗi `asr_triggers` có `kind` hợp lệ + `evidence` thật.
- [ ] Follow-up có id `fde-00x` nếu đã có task tương ứng.
- [ ] `npm run adr -- validate` sạch; `npm test` xanh.

## 11. Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| `ADR-CONFIG-LAST-ID-STALE` | Quên cập nhật `last_decision_id` | Tăng lên id lớn nhất vừa tạo |
| `ADR-NUMERIC-CLAIM` (warn) | Câu văn có số liệu không nguồn | Thêm `> Source:` hoặc bỏ số liệu |
| `ADR-NAME-FORMAT` | File còn kiểu `ADR-00x.md` | Đổi sang `NNNN-slug.md` + thêm frontmatter |
| `ADR-FRONTMATTER-MISSING` | ADR legacy dạng bullet metadata | Chuyển metadata vào frontmatter MADR v4 |
| `ADR-OWNER-NOT-INVOLVED` | `deciders` không chứa `owner` của cấu hình | Thêm owner team vào `deciders` |
