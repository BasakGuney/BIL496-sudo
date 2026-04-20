import argparse
import json
from itertools import product
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = BASE_DIR / "eval_examples_500.json"

LABEL_PREFIXES = {
    "followup_candidate": ["Kisaca,", "Ilk asamada,", "Ozetle,", "Genel olarak,"],
    "new_topic_candidate": ["Detayli olarak,", "Somut olarak,", "Acilacak olursa,", "Net olarak,"],
    "supportive_repair_candidate": ["Acikcasi,", "Su an dusununce,", "Tam olarak,", "Dogrusu,"],
}

LABEL_SUFFIXES = {
    "followup_candidate": ["Biraz daha acabilirim.", "Detayi da anlatabilirim.", "Isterse daha fazla acabilirim."],
    "new_topic_candidate": ["Bu sekilde ilerledik.", "Sonuc olarak bu yaklasimi kullandik.", "Ozetle cozum buydu."],
    "supportive_repair_candidate": ["Su an daha netlestiremiyorum.", "Aklima gelirse acabilirim.", "Detaylari cikaramiyorum."],
}


LABEL_SPECS = [
    (
        "followup_candidate",
        167,
        [
            {
                "interview_type": "Technical",
                "mode": "Neutral",
                "question_template": "{topic} deneyiminiz nasildi?",
                "answer_template": "{short_answer}.",
                "slots": {
                    "topic": ["React'te state yonetimi", "Docker", "Redis", "Unit test", "CI/CD", "Caching"],
                    "short_answer": [
                        "Context API kullandim",
                        "Docker kullandim",
                        "Redis kullandik",
                        "Test yazdim",
                        "Pipeline kurduk",
                        "Cache ekledik",
                    ],
                },
            },
            {
                "interview_type": "Technical",
                "mode": "Neutral",
                "question_template": "{problem} nasil cozdunuz?",
                "answer_template": "{brief_solution}.",
                "slots": {
                    "problem": ["Performans problemini", "Latency sorununu", "Veritabani darboğazini", "Deployment hatasini"],
                    "brief_solution": ["Index ekledik", "Loglara baktik", "Rollback yaptik", "Sorguyu duzelttik"],
                },
            },
            {
                "interview_type": "HR",
                "mode": "Neutral",
                "question_template": "{hr_question}",
                "answer_template": "{brief_hr_answer}.",
                "slots": {
                    "hr_question": [
                        "Kendinizden biraz bahseder misiniz?",
                        "Kariyer hedeflerinizden biraz bahseder misiniz?",
                        "Bir hatanizdan ogrendiginiz seyi anlatir misiniz?",
                        "Zaman baskisinda nasil karar verirsiniz?",
                    ],
                    "brief_hr_answer": [
                        "Backend gelistiriyorum",
                        "Yazilimda ilerlemek istiyorum",
                        "Bir hata yaptim ve ogrendim",
                        "Kritik olani secerim",
                    ],
                },
            },
            {
                "interview_type": "HR",
                "mode": "Neutral",
                "question_template": "{open_question}",
                "answer_template": "{compact_answer}.",
                "slots": {
                    "open_question": [
                        "Baski altinda calistiginiz bir ornegi biraz acabilir misiniz?",
                        "Geri bildirim aldiginiz zor bir ani anlatir misiniz?",
                        "Takim ici bir anlasmazligi nasil yonettiniz?",
                    ],
                    "compact_answer": [
                        "Konustuk ve cozuldu",
                        "Bir geri bildirim aldim ve uzerine calistim",
                        "Kritik isi onceledim ve ilerledim",
                    ],
                },
            },
        ],
    ),
    (
        "new_topic_candidate",
        167,
        [
            {
                "interview_type": "Technical",
                "mode": "Neutral",
                "question_template": "Daha once {binary_topic} mi?",
                "answer_template": "{binary_answer}",
                "slots": {
                    "binary_topic": [
                        "Redis kullandiniz",
                        "Docker ile calistiniz",
                        "Feature flag kullandiniz",
                        "Production incident yonettiniz",
                        "Mesaj kuyrugu kullandiniz",
                    ],
                    "binary_answer": ["Evet", "Hayir", "Kullandim"],
                },
            },
            {
                "interview_type": "Technical",
                "mode": "Neutral",
                "question_template": "{technical_question}",
                "answer_template": "{detailed_answer}",
                "slots": {
                    "technical_question": [
                        "API performansini nasil olctunuz?",
                        "Queue consumer yavaslayinca nasil mudahale ettiniz?",
                        "Observability tarafinda hangi metrikleri izlediniz?",
                        "Trade-off'lari nasil degerlendirdiniz?",
                    ],
                    "detailed_answer": [
                        "p95 latency, throughput ve hata oranini izledik; yuk testleriyle once-sonra karsilastirdik",
                        "Consumer sayisini artirdik, isleri partisyonladik ve darboğazi ayri analiz ettik",
                        "Latency, error rate ve throughput baktik; alarm esiklerini de buna gore belirledik",
                        "Bakim maliyeti ile hiz arasinda denge kurduk ve asamali ilerledik",
                    ],
                },
            },
            {
                "interview_type": "HR",
                "mode": "Neutral",
                "question_template": "{hr_binary_question}",
                "answer_template": "{binary_answer}",
                "slots": {
                    "hr_binary_question": [
                        "Daha once staj yaptiniz mi?",
                        "Daha once takim lideri oldunuz mu?",
                        "Musteri ile dogrudan iletisim kurdunuz mu?",
                        "Startup ortaminda calistiniz mi?",
                        "Geri bildirim vermek sizin icin kolay midir?",
                    ],
                    "binary_answer": ["Evet", "Hayir"],
                },
            },
            {
                "interview_type": "HR",
                "mode": "Neutral",
                "question_template": "{hr_open_question}",
                "answer_template": "{full_hr_answer}",
                "slots": {
                    "hr_open_question": [
                        "Bu kurumda neden calismak istiyorsunuz?",
                        "Takim arkadasinizla anlasmazlik yasadiginizda ne yaparsiniz?",
                        "Bir ekipte uyumu nasil saglarsiniz?",
                        "Uzaktan calismada kendinizi nasil organize edersiniz?",
                    ],
                    "full_hr_answer": [
                        "Urun etkisi yuksek bir ekipte sorumluluk alarak gelismek istiyorum ve rol bunu destekliyor",
                        "Taraflari dinler, problemi netlestirir ve ortak hedefe odakli bir cozum bulurum",
                        "Beklentileri erken netlestirir, sorunlari birikmeden konusur ve ritim olustururum",
                        "Takvim bloklari olusturur, gunluk oncelikleri netlestirir ve gorunurlugu korurum",
                    ],
                },
            },
        ],
    ),
    (
        "supportive_repair_candidate",
        166,
        [
            {
                "interview_type": "Technical",
                "mode": "Supportive",
                "question_template": "{question}",
                "answer_template": "{uncertain_answer}.",
                "slots": {
                    "question": [
                        "Latency problemini nasil incelediniz?",
                        "Bu API tasariminda neden bu yaklasimi sectiniz?",
                        "Load balancing kararini nasil aldiniz?",
                        "Bu deployment sonrasinda neden rollback yaptiniz?",
                    ],
                    "uncertain_answer": [
                        "Tam hatirlayamadim",
                        "Emin degilim",
                        "Detayini hatirlamiyorum",
                        "Su an net bir ornek veremiyorum",
                    ],
                },
            },
            {
                "interview_type": "HR",
                "mode": "Supportive",
                "question_template": "{question}",
                "answer_template": "{uncertain_answer}.",
                "slots": {
                    "question": [
                        "Bu pozisyonda sizi en cok ne motive ediyor?",
                        "Liderlik ettiginiz bir durumu anlatabilir misiniz?",
                        "Sizi en cok zorlayan profesyonel deneyim hangisiydi?",
                        "Sizi en cok gururlandiran basari neydi?",
                    ],
                    "uncertain_answer": [
                        "Tam olarak nasil ifade edecegimi bilemedim",
                        "Su an net bir durum secemiyorum",
                        "Aklima gelmedi",
                        "Toparlayamadim",
                    ],
                },
            },
            {
                "interview_type": "Technical",
                "mode": "Supportive",
                "question_template": "{question}",
                "answer_template": "{soft_uncertainty}.",
                "slots": {
                    "question": [
                        "Bu incidenti neden bu sekilde ele aldiniz?",
                        "Bu sistemde cache stratejisini neden boyle kurdunuz?",
                        "Microservice mimarisinde en buyuk zorluk neydi?",
                    ],
                    "soft_uncertainty": [
                        "Bilemedim, o an ekip yonlendirmisti",
                        "Sanirim ama cok net hatirlamiyorum",
                        "Yanlis hatirlamiyorsam oyleydi",
                    ],
                },
            },
        ],
    ),
]


def parse_args():
    parser = argparse.ArgumentParser(description="Generate synthetic eval examples for answer_state.")
    parser.add_argument(
        "--total-count",
        type=int,
        default=500,
        help="Total number of examples to generate across all labels.",
    )
    parser.add_argument(
        "--output-path",
        type=Path,
        default=OUTPUT_PATH,
        help="Destination JSON path.",
    )
    return parser.parse_args()


def build_target_counts(total_count):
    label_names = [label for label, _, _ in LABEL_SPECS]
    base = total_count // len(label_names)
    remainder = total_count % len(label_names)
    counts = {}
    for index, label in enumerate(label_names):
        counts[label] = base + (1 if index < remainder else 0)
    return counts


def build_examples(target_label, target_count, groups, start_id):
    examples = []
    seen = set()

    while len(examples) < target_count:
        progress = False
        for group in groups:
            slot_names = list(group["slots"].keys())
            for combo in product(*(group["slots"][name] for name in slot_names)):
                values = dict(zip(slot_names, combo))
                question_text = group["question_template"].format(**values)
                answer_text = group["answer_template"].format(**values)
                key = (group["interview_type"], group["mode"], question_text, answer_text, target_label)
                if key in seen:
                    continue
                seen.add(key)
                examples.append(
                    {
                        "id": start_id + len(examples),
                        "interview_type": group["interview_type"],
                        "mode": group["mode"],
                        "question_text": question_text,
                        "answer_text": answer_text,
                        "answer_state": target_label,
                    }
                )
                progress = True
                if len(examples) >= target_count:
                    break
            if len(examples) >= target_count:
                break
        if len(examples) >= target_count:
            break
        if not progress:
            break

    if len(examples) < target_count:
        base_examples = list(examples)
        for prefix in LABEL_PREFIXES[target_label]:
            for item in base_examples:
                if len(examples) >= target_count:
                    break
                question_text = f"{prefix} {item['question_text'][0].lower()}{item['question_text'][1:]}"
                answer_text = item["answer_text"]
                key = (item["interview_type"], item["mode"], question_text, answer_text, target_label)
                if key in seen:
                    continue
                seen.add(key)
                examples.append(
                    {
                        "id": start_id + len(examples),
                        "interview_type": item["interview_type"],
                        "mode": item["mode"],
                        "question_text": question_text,
                        "answer_text": answer_text,
                        "answer_state": target_label,
                    }
                )
            if len(examples) >= target_count:
                break

    if len(examples) < target_count:
        base_examples = list(examples)
        for suffix in LABEL_SUFFIXES[target_label]:
            for item in base_examples:
                if len(examples) >= target_count:
                    break
                answer_text = item["answer_text"]
                if answer_text.endswith("."):
                    answer_text = f"{answer_text[:-1]} {suffix}"
                else:
                    answer_text = f"{answer_text} {suffix}"
                question_text = item["question_text"]
                key = (item["interview_type"], item["mode"], question_text, answer_text, target_label)
                if key in seen:
                    continue
                seen.add(key)
                examples.append(
                    {
                        "id": start_id + len(examples),
                        "interview_type": item["interview_type"],
                        "mode": item["mode"],
                        "question_text": question_text,
                        "answer_text": answer_text,
                        "answer_state": target_label,
                    }
                )
            if len(examples) >= target_count:
                break

    if len(examples) < target_count:
        raise ValueError(f"Could not generate enough examples for {target_label}")

    return examples


def main():
    args = parse_args()
    target_counts = build_target_counts(args.total_count)
    all_examples = []
    next_id = 1

    for label, _, groups in LABEL_SPECS:
        target_count = target_counts[label]
        generated = build_examples(label, target_count, groups, next_id)
        all_examples.extend(generated)
        next_id += len(generated)

    args.output_path.write_text(json.dumps(all_examples, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(all_examples)} examples to {args.output_path}")


if __name__ == "__main__":
    main()
