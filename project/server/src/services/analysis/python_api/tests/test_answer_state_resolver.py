import sys
import tempfile
import unittest
from pathlib import Path


PYTHON_API_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_API_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_API_DIR))

import answer_state_resolver as asr


class AnswerStateResolverTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temp_dir = tempfile.TemporaryDirectory(prefix="qdrant-answer-state-test-")
        asr.QDRANT_DATA_DIR = Path(cls._temp_dir.name)
        asr._load_examples.cache_clear()
        asr._get_client.cache_clear()

    @classmethod
    def tearDownClass(cls):
        try:
            client = asr._get_client()
            client.close()
        except Exception:
            pass
        asr._get_client.cache_clear()
        cls._temp_dir.cleanup()

    def test_binary_yes_no_is_sufficient(self):
        result = asr.infer_answer_state(
            "Daha once Redis kullandiniz mi?",
            "Evet",
            interview_type="Technical",
            mode="Neutral",
        )
        self.assertEqual(result.get("answerState"), "new_topic_candidate")
        self.assertIn(result.get("method"), {"rule", "qdrant", "qdrant_exact"})

    def test_uncertainty_prefers_supportive_repair_in_supportive_mode(self):
        result = asr.infer_answer_state(
            "Bu problemi nasil cozdunuz?",
            "Tam emin degilim, hatirlamiyorum.",
            interview_type="Technical",
            mode="Supportive",
        )
        self.assertEqual(result.get("answerState"), "supportive_repair_candidate")

    def test_bilemedim_counts_as_uncertainty(self):
        result = asr.infer_answer_state(
            "Bu surecte en buyuk zorluk neydi?",
            "Bilemedim su an.",
            interview_type="Technical",
            mode="Supportive",
        )
        self.assertEqual(result.get("answerState"), "supportive_repair_candidate")


if __name__ == "__main__":
    unittest.main()
