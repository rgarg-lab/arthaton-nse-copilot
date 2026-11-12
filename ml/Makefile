# Thin wrapper over tasks.py, which is the canonical implementation of every
# target. Keeping the logic in Python means the pipeline runs identically on a
# machine with no `make` (Windows) — see ml/tasks.py.
#
#   make -C ml help
#   make -C ml refresh

PYTHON ?= python

.PHONY: help install install-sentiment data sentiment train eval signals refresh serve test lint

help:
	@$(PYTHON) tasks.py help

install:
	@$(PYTHON) tasks.py install

install-sentiment:
	@$(PYTHON) tasks.py install-sentiment

data:
	@$(PYTHON) tasks.py data

sentiment:
	@$(PYTHON) tasks.py sentiment

train:
	@$(PYTHON) tasks.py train

eval:
	@$(PYTHON) tasks.py eval

signals:
	@$(PYTHON) tasks.py signals

refresh:
	@$(PYTHON) tasks.py refresh

serve:
	@$(PYTHON) tasks.py serve

test:
	@$(PYTHON) tasks.py test

lint:
	@$(PYTHON) tasks.py lint
