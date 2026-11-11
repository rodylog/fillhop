#!/usr/bin/env python3
"""Tests de generate.py (unittest, bibliotheque standard) : les donnees inlinees dans le
<script> de la page (snapshot de repli, table des provinces espagnoles) ne peuvent ni refermer
ce script ni en ouvrir un autre. Releve du 11/11/2026 : une adresse du flux contenant
« </script><script>… » cassait la page, et le second script etait hache par csp_meta, donc
autorise par la CSP.

Sans reseau : le flux des prix et la bibliotheque MapLibre sont remplaces ; la page est ecrite
dans un dossier temporaire (--out), jamais a l'emplacement par defaut.

    python3 generate_test.py
"""
import contextlib
import io
import json
import os
import re
import tempfile
import unittest
from unittest import mock

import generate

PIEGE = "1 rue </script><script>alert(1)</script>"
COMMENTAIRE = "<!-- <script> jamais referme"


def generer(lignes, provinces=None):
    """La page generee avec `lignes` pour snapshot (et `provinces` pour table, si donnee)."""
    lire = generate.lire

    def lire_piege(nom):
        if nom == "es-provincias.json" and provinces is not None:
            return json.dumps(provinces, ensure_ascii=False)
        return lire(nom)

    with tempfile.TemporaryDirectory() as dossier:
        sortie = os.path.join(dossier, "index.html")
        with mock.patch.object(generate, "snapshot", lambda *a: lignes), \
             mock.patch.object(generate, "biblio_inline", lambda nom, sri: "/* %s */" % nom), \
             mock.patch.object(generate, "lire", lire_piege), \
             mock.patch("sys.argv", ["generate.py", "--out", sortie]), \
             contextlib.redirect_stdout(io.StringIO()):
            generate.main()
        with open(sortie, encoding="utf-8") as f:
            return f.read()


def balises(html):
    return html.count("<script"), html.count("</script"), html.count("<!--"), html.count("'sha256-")


class DonneesInlinees(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temoin = generer([])

    def test_page_temoin(self):
        self.assertEqual(self.temoin.count("<script"), 2)
        self.assertEqual(self.temoin.count("'sha256-"), 2)

    def test_snapshot_qui_referme_le_script(self):
        html = generer([{"adresse": PIEGE, "ville": "</SCRIPT >"}])
        self.assertEqual(balises(html), balises(self.temoin))
        self.assertNotIn("<script>alert(1)", html)

    def test_snapshot_qui_ouvre_un_commentaire(self):
        html = generer([{"adresse": COMMENTAIRE}])
        self.assertEqual(balises(html), balises(self.temoin))

    def test_snapshot_relu_a_l_identique(self):
        lignes = [{"adresse": PIEGE, "ville": COMMENTAIRE, "cp": "34000", "prix": 1.709}]
        html = generer(lignes)
        m = re.search(r"^const SNAPSHOT = (.*);$", html, re.M)
        self.assertIsNotNone(m)
        self.assertEqual(json.loads(m.group(1)), lignes)

    def test_table_des_provinces_piegee(self):
        html = generer([], provinces={"17": {"nom": PIEGE + COMMENTAIRE, "bbox": [0, 0, 1, 1]}})
        self.assertEqual(balises(html), balises(self.temoin))
        self.assertNotIn("<script>alert(1)", html)


if __name__ == "__main__":
    unittest.main()
