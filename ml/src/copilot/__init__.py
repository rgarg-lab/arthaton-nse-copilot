"""NSE Copilot ML service.

Owns all modelling, evaluation and finance maths. Contains no LLM dependency of
any kind — explanations are generated in the Next.js app, grounded by this
service's endpoints (BUILD_SPEC.md §4.1).
"""

__version__ = "0.1.0"
