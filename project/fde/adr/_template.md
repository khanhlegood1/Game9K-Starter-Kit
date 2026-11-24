---
id: "NNNN"
title: "<short title, representative of solved problem and found solution>"
description: "<one sentence: what this decision changes and why it matters>"
type: "network" # network (infra/protocol) | use-case (business flow with API)
status: "proposed" # proposed | accepted | rejected | deprecated | superseded | withdrawn
date: "YYYY-MM-DD"
proposed_date: "YYYY-MM-DD"
accepted_date: null
deciders:
  - "<role or team, never an individual @handle>"
consulted:
  - "<role whose opinion was sought>"
informed:
  - "<role kept up to date>"
affected_components:
  - "<path or component>"
related: []
tags:
  - "adr"
supersedes: null # ["0003"] when this decision replaces others
superseded-by: null # "0007" when this decision is replaced
asr_triggers:
  - kind: "maintainability" # cost|performance|security|compliance|availability|scalability|maintainability|evolvability
    evidence: "<link, doc, ticket or quoted constraint>"
    note: "<why this trigger applies, <=280 chars>"
---

# <Title>

## Problem

<What problem forces a decision? Two to four sentences.>

## Context

<Constraints, upstream decisions, stakeholder pressure, regulatory or platform limits.>

## Decision

1. <Chosen option and what it forbids.>
2. <...>

## Consequences

**Tích cực**

- <positive consequence>

**Đánh đổi (Bad)**

- <accepted downside — required so future readers see the trade-off>

## Alternatives

| Phương án | Vì sao không chọn |
| --- | --- |
| <alternative 1> | <reason> |
| <alternative 2> | <reason> |

## Confirmation

<How compliance is verified: tests, CLI commands, review gates.>

## Follow-ups

- `<task-id>`: <what still has to happen>
