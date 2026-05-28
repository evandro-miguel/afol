set unstable := true
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set working-directory := "."

import 'docs/standards/Justfile'

validate-strict: all-strict
