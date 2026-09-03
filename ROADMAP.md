# Roadmap

## Alpha scope

| Surface | Status |
| --- | --- |
| Core task and evidence lifecycle | Stable alpha |
| Bootstrap and template update | Stable alpha |
| Safe local mutations | Stable alpha |
| Linux x64 | Supported |
| WSL2 | Supported with observed local smoke |
| Native Windows x64 | Experimental |
| macOS and ARM | Not supported yet |
| Evolution and fleet | Experimental |
| Memory and library adoption | Experimental or planned |

Hosted CI provides regression evidence. Local exact-SHA validation remains the
source-release authority. This roadmap does not claim binary publication,
attestation, or global installation.

## After the first public alpha

- Decide whether native Windows becomes a supported target.
- Collect controlled external beta feedback.
- Evaluate macOS and ARM only after a dedicated release path exists.
- Consider package-manager distribution only after source installation is a
  separately tested product path.
