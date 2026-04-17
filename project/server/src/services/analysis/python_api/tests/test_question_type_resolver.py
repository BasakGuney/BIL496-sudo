import sys
import tempfile
import unittest
from pathlib import Path


PYTHON_API_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_API_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_API_DIR))

import question_type_resolver as qtr


class QuestionTypeResolverTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._temp_dir = tempfile.TemporaryDirectory(prefix="qdrant-question-type-test-")
        qtr.QDRANT_DATA_DIR = Path(cls._temp_dir.name)
        qtr.QUESTION_TYPE_DEBUG = False
        qtr._load_examples.cache_clear()
        qtr._get_client.cache_clear()

    @classmethod
    def tearDownClass(cls):
        try:
            client = qtr._get_client()
            client.close()
        except Exception:
            pass
        qtr._get_client.cache_clear()
        cls._temp_dir.cleanup()

    def assert_question_type(self, interview_type, question, expected_type):
        result = qtr.infer_question_type(question, interview_type)
        matches = result.get("matches") or []
        confidence = result.get("confidence")
        low_confidence_flag = " LOW_CONFIDENCE" if isinstance(confidence, (int, float)) and confidence < 0.65 else ""
        match_summary = " | ".join(
            f"{index + 1}:{match.get('questionType')}@{match.get('score')}::{match.get('question')}"
            for index, match in enumerate(matches[:3])
        ) or "-"
        print(
            "[resolver-test]",
            f"interview_type={interview_type}",
            f"expected={expected_type}",
            f"actual={result.get('questionType')}",
            f"method={result.get('method')}",
            f"confidence={confidence}",
            f"question={question}",
            f"top_matches={match_summary}",
            low_confidence_flag,
        )
        self.assertEqual(
            result.get("questionType"),
            expected_type,
            msg=f"Unexpected type for question: {question!r}. Full result: {result}",
        )

    def test_meta_questions(self):
        cases = [
            "Başka bir sorunuz var mı Ece Hanım?",
            "Bu soru ve yanıtlarımızla ilgili başka eklemek istediğiniz bir şey var mı?",
            "Başlamadan önce aklınıza takılan bir konu var mı?",
            "Şimdi, bu soru ve yanıtlarımızla ilgili başka eklemek istediğiniz bir şey var mı?",
        ]
        for question in cases:
            with self.subTest(question=question):
                self.assert_question_type("HR", question, "meta")

    def test_hr_questions(self):
        cases = [
            ("Peki, bu geri bildirimlerden aldığınız en önemli ders neydi?", "behavioral"),
            ("Şimdi biraz farklı bir konuya geçelim: Sizi en çok motive eden şey nedir bu pozisyonda?", "motivation"),
            ("Sizi bu pozisyonda en çok motive eden uzun vadeli kariyer hedefleriniz neler?", "motivation"),
            ("Bize biraz kendinizden bahseder misiniz?", "self_presentation"),
            ("Kendinden bahseder misin? Eğitimin, deneyimlerin, ilgi alanların neler?", "self_presentation"),
            ("Okul projelerinizden ve staj deneyimlerinizden bahseder misiniz?", "experience"),
            ("Peki, bu süreçte ekip içinde geri bildirimleri nasıl aldınız, nasıl paylaştınız?", "behavioral"),
        ]
        for question, expected_type in cases:
            with self.subTest(question=question):
                self.assert_question_type("HR", question, expected_type)

    def test_technical_questions(self):
        cases = [
            ("REST API nedir?", "technical_knowledge"),
            (
                "Az önce bahsettiğiniz o öncelikle kullanıcı deneyimi ve performans odaklı yaklaşımdan ilginç örnekleriniz var mı? "
                "Peki, biraz daha derinleştirebilir miyiz? O alanda karşılaştığınız zorluklar oldu mu?",
                "technical_experience",
            ),
            (
                "Bu durumda siz tam olarak ne yaptınız? Yani, o test ve optimizasyon süreçlerinde bireysel olarak katkınız neydi?",
                "technical_experience",
            ),
            ("Peki, bu süreçte sizin bireysel katkınız tam olarak ne oldu?", "technical_experience"),
            (
                "Peki, bu playbook'u geliştirirken karşılaştığınız en büyük zorluk neydi ve nasıl çözdünüz",
                "technical_experience",
            ),
            ("Bir performans darboğazını nasıl analiz eder ve çözerdiniz?", "problem_solving"),
        ]
        for question, expected_type in cases:
            with self.subTest(question=question):
                self.assert_question_type("Technical", question, expected_type)


if __name__ == "__main__":
    unittest.main()
