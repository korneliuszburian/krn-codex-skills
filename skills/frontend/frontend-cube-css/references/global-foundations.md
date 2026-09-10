# Global foundations

Use this only when an explicit task creates or repairs the host CUBE Global
layer. A local component defect is not grounds for a global override: reject a
card-specific value that leaks into an unrelated view and repair the card's
Block or Composition owner instead.

| Concern | Authorized scope / inspect | Smallest safe intervention | Non-goal | Observable falsifier |
|---|---|---|---|---|
| Reset / normalization | Existing host baseline across affected views | Align one documented cross-view browser inconsistency | A component patch or a new boilerplate reset | An unrelated control or region changes without sharing the defect |
| Element type / measure | Host element/type roles and long-content surfaces | Adjust an established role shared by the declared readers | One card's type treatment | Long content or a second view becomes unreadable |
| Media / form inheritance | Host media and native-control conventions | Preserve intended inheritance/normalization at the shared seam | Replacing a control's semantic state | Native control/media differs unexpectedly in another view |
| Focus / keyboard escape | Keyboard path, visible focus, native escape behaviour | Restore a visible, usable shared focus baseline | Declaring conformance or styling pointer-only affordance | No-font/no-script keyboard path loses focus, reachability, or escape |
| Motion preference | Existing reduced-motion posture and animated surfaces | Respect the host preference at the shared motion seam | Removing all motion by default | Declared reduced-motion condition still animates essential movement |
| Direction / writing mode | Logical-property use, RTL, and long-content state | Correct a shared direction-sensitive rule | Physical one-view positioning | RTL or long content breaks a neighbouring surface |

Check the declared affected views, then a no-font/no-script keyboard path and
RTL/long-content condition where applicable. This is original synthesis from
CV-01/CV-07/PS-09–PS-11 and current CSS/HTML/WAI source classes; it supplies no
reset, selector, token, or starter API.
