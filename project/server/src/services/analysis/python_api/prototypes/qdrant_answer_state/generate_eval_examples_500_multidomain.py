import argparse
import json
from itertools import product
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = BASE_DIR / "eval_examples_500_multidomain.json"


PREFIXES = {
    "followup_candidate": ["Kisaca,", "Ozetle,", "Ilk bakista,"],
    "new_topic_candidate": ["Detayli olarak,", "Somut olarak,", "Net olarak,"],
    "supportive_repair_candidate": ["Acikcasi,", "Su an dusununce,", "Dogrusu,"],
}

SUFFIXES = {
    "followup_candidate": ["Isterse acabilirim.", "Detayini verebilirim.", "Daha fazla acilabilir."],
    "new_topic_candidate": ["Bu sekilde cozuldu.", "Sonucta boyle ilerledik.", "Ozetle bu yaklasimi kullandik."],
    "supportive_repair_candidate": ["Su an netlestiremiyorum.", "Detayi cikaramiyorum.", "Ornek veremiyorum."],
}


DOMAINS = {
    "frontend": {
        "binary_tools": ["React", "Vue", "Redux", "Tailwind", "Next.js"],
        "experience_topics": ["state yonetimi", "render optimizasyonu", "form dogrulama akisi", "routing yapisi"],
        "followup_answers": ["Context kullandim", "Memoization yaptik", "Form library kullandik", "Route guard ekledik"],
        "detailed_answers": [
            "Yeniden render olan componentleri profiler ile inceledik, state'i parcali yapip gereksiz hesaplamalari azalttik",
            "Global state'i sadeleştirip asenkron akislari netlestirdik ve UI tarafinda bekleme durumlarini ayirdik",
        ],
    },
    "backend": {
        "binary_tools": ["Node.js", "Express", "Spring Boot", "FastAPI", "GraphQL"],
        "experience_topics": ["API performansi", "yetkilendirme akisleri", "transaction yonetimi", "servis ayrimi"],
        "followup_answers": ["Cache ekledik", "JWT kullandik", "Transaction kullandik", "Servisi ayirdik"],
        "detailed_answers": [
            "p95 latency ve hata oranini izleyip darboğaz olan sorgulari ayri optimize ettik",
            "Yetkilendirme kurallarini middleware katmanina tasiyip role bazli kontrolu merkezi hale getirdik",
        ],
    },
    "data": {
        "binary_tools": ["Pandas", "Spark", "Airflow", "dbt", "Kafka"],
        "experience_topics": ["veri temizleme sureci", "ETL tasarimi", "feature engineering", "pipeline gozlemi"],
        "followup_answers": ["Eksik verileri temizledik", "DAG yazdik", "Feature cikardik", "Log baktik"],
        "detailed_answers": [
            "Veri kalitesini kurallarla kontrol edip eksik ve aykiri kayitlari asamali olarak eledik",
            "Dagitik ETL akisini batch pencerelerine bolduk ve hata alan adimlar icin yeniden deneme ekledik",
        ],
    },
    "devops": {
        "binary_tools": ["Docker", "Kubernetes", "Terraform", "Jenkins", "GitHub Actions"],
        "experience_topics": ["deployment yapisi", "rollback karari", "CI/CD pipeline", "gozlemleme kurulumu"],
        "followup_answers": ["Rolling update yaptik", "Rollback aldik", "Pipeline kurduk", "Dashboard actik"],
        "detailed_answers": [
            "Deployment adimlarini ortam bazli ayirip test kapilari ve manuel onay mekanizmasi ekledik",
            "Cluster metriklerini merkezi izleyip alarm esikleriyle olaylara hizli mudahale ettik",
        ],
    },
    "security": {
        "binary_tools": ["OAuth", "JWT", "WAF", "rate limiting", "MFA"],
        "experience_topics": ["kimlik dogrulama akisi", "yetki kontrolu", "guvenlik olayi", "istek kisitlama"],
        "followup_answers": ["JWT kullandik", "Role baktik", "WAF actik", "Limit koyduk"],
        "detailed_answers": [
            "Token omurlerini kisaltip refresh mekanizmasini ayri yonettik ve yetki kurallarini servis bazli tanimladik",
            "Saldiri belirtilerini log ve metriklerden tespit edip isteklere katmanli kisitlar uyguladik",
        ],
    },
    "mobile": {
        "binary_tools": ["React Native", "Flutter", "Firebase", "SwiftUI", "Kotlin"],
        "experience_topics": ["offline senkronizasyon", "push notification", "state yonetimi", "performans profilleme"],
        "followup_answers": ["Local cache kullandik", "Firebase ekledik", "Bloc kullandik", "Profiler actik"],
        "detailed_answers": [
            "Offline veri senkronunu kuyruklayip baglanti geldiginde cakisma cozumleriyle birlestirdik",
            "Bildirim akislarini segmentlere gore ayirip teslim oranlarini olay bazli izledik",
        ],
    },
}


FOLLOWUP_GROUPS = []
NEWTOPIC_GROUPS = []
SUPPORTIVE_GROUPS = []

for domain_name, domain in DOMAINS.items():
    FOLLOWUP_GROUPS.extend(
        [
            {
                "interview_type": "Technical",
                "mode": "Neutral",
                "question_template": f"{domain_name.title()} tarafinda {{topic}} deneyiminiz nasildi?",
                "answer_template": "{answer}.",
                "slots": {
                    "topic": domain["experience_topics"],
                    "answer": domain["followup_answers"],
                },
            },
            {
                "interview_type": "Technical",
                "mode": "Neutral",
                "question_template": f"{domain_name.title()} alaninda yasadiginiz bir problemi nasil cozdunuz?",
                "answer_template": "{answer}.",
                "slots": {
                    "answer": ["Loglara baktik", "Kodu duzelttik", "Ayari degistirdik", "Servisi yeniden baslattik"],
                },
            },
        ]
    )
    NEWTOPIC_GROUPS.extend(
        [
            {
                "interview_type": "Technical",
                "mode": "Neutral",
                "question_template": f"Daha once {{tool}} ile {domain_name} tarafinda calistiniz mi?",
                "answer_template": "{answer}",
                "slots": {
                    "tool": domain["binary_tools"],
                    "answer": ["Evet", "Hayir", "Kullandim"],
                },
            },
            {
                "interview_type": "Technical",
                "mode": "Neutral",
                "question_template": f"{domain_name.title()} tarafinda {{topic}} konusunda nasil ilerlediniz?",
                "answer_template": "{answer}",
                "slots": {
                    "topic": domain["experience_topics"],
                    "answer": domain["detailed_answers"],
                },
            },
        ]
    )
    SUPPORTIVE_GROUPS.extend(
        [
            {
                "interview_type": "Technical",
                "mode": "Supportive",
                "question_template": f"{domain_name.title()} tarafinda {{topic}} kararini neden aldiniz?",
                "answer_template": "{answer}.",
                "slots": {
                    "topic": domain["experience_topics"],
                    "answer": [
                        "Tam hatirlayamadim",
                        "Emin degilim",
                        "Su an net bir ornek veremiyorum",
                        "Detayini cikaramiyorum",
                    ],
                },
            }
        ]
    )


FOLLOWUP_GROUPS.extend(
    [
        {
            "interview_type": "HR",
            "mode": "Neutral",
            "question_template": "{question}",
            "answer_template": "{answer}.",
            "slots": {
                "question": [
                    "Kendinizden biraz bahseder misiniz?",
                    "Kariyer hedeflerinizden biraz bahseder misiniz?",
                    "Baski altinda nasil calistiginiza dair bir ornek verebilir misiniz?",
                    "Bir hatanizdan ogrendiginiz seyi anlatir misiniz?",
                ],
                "answer": [
                    "Yazilim gelistiriyorum",
                    "Ilerlemek istiyorum",
                    "Kritik isi onceledim",
                    "Bir hata yaptim ve ogrendim",
                ],
            },
        }
    ]
)

NEWTOPIC_GROUPS.extend(
    [
        {
            "interview_type": "HR",
            "mode": "Neutral",
            "question_template": "{question}",
            "answer_template": "{answer}",
            "slots": {
                "question": [
                    "Daha once takim lideri oldunuz mu?",
                    "Musteri ile dogrudan iletisim kurdunuz mu?",
                    "Geri bildirim vermek sizin icin kolay midir?",
                    "Bu kurumda neden calismak istiyorsunuz?",
                ],
                "answer": [
                    "Evet",
                    "Hayir",
                    "Urun etkisi yuksek bir ekipte sahiplik alarak gelismek istiyorum",
                    "Takimlari dinler, problemi netlestirir ve ortak hedefe odakli ilerlerim",
                ],
            },
        }
    ]
)

SUPPORTIVE_GROUPS.extend(
    [
        {
            "interview_type": "HR",
            "mode": "Supportive",
            "question_template": "{question}",
            "answer_template": "{answer}.",
            "slots": {
                "question": [
                    "Bu pozisyonda sizi en cok ne motive ediyor?",
                    "Liderlik ettiginiz bir durumu anlatabilir misiniz?",
                    "Sizi en cok gururlandiran basari neydi?",
                    "Sizi en cok zorlayan profesyonel deneyim hangisiydi?",
                ],
                "answer": [
                    "Tam olarak nasil ifade edecegimi bilemedim",
                    "Su an net bir durum secemiyorum",
                    "Aklima gelmedi",
                    "Toparlayamadim",
                ],
            },
        }
    ]
)


LABEL_SPECS = [
    ("followup_candidate", 167, FOLLOWUP_GROUPS),
    ("new_topic_candidate", 167, NEWTOPIC_GROUPS),
    ("supportive_repair_candidate", 166, SUPPORTIVE_GROUPS),
]


def parse_args():
    parser = argparse.ArgumentParser(description="Generate multidomain synthetic eval examples for answer_state.")
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


def build_examples(label, target_count, groups, start_id):
    examples = []
    seen = set()

    for group in groups:
        slot_names = list(group["slots"].keys())
        for combo in product(*(group["slots"][name] for name in slot_names)):
            values = dict(zip(slot_names, combo))
            question = group["question_template"].format(**values)
            answer = group["answer_template"].format(**values)
            key = (group["interview_type"], group["mode"], question, answer, label)
            if key in seen:
                continue
            seen.add(key)
            examples.append(
                {
                    "id": start_id + len(examples),
                    "interview_type": group["interview_type"],
                    "mode": group["mode"],
                    "question_text": question,
                    "answer_text": answer,
                    "answer_state": label,
                }
            )
            if len(examples) >= target_count:
                return examples

    base_examples = list(examples)
    for prefix in PREFIXES[label]:
        for item in base_examples:
            if len(examples) >= target_count:
                return examples
            question = f"{prefix} {item['question_text'][0].lower()}{item['question_text'][1:]}"
            key = (item["interview_type"], item["mode"], question, item["answer_text"], label)
            if key in seen:
                continue
            seen.add(key)
            examples.append(
                {
                    "id": start_id + len(examples),
                    "interview_type": item["interview_type"],
                    "mode": item["mode"],
                    "question_text": question,
                    "answer_text": item["answer_text"],
                    "answer_state": label,
                }
            )

    base_examples = list(examples)
    for suffix in SUFFIXES[label]:
        for item in base_examples:
            if len(examples) >= target_count:
                return examples
            answer = item["answer_text"]
            if answer.endswith("."):
                answer = f"{answer[:-1]} {suffix}"
            else:
                answer = f"{answer} {suffix}"
            key = (item["interview_type"], item["mode"], item["question_text"], answer, label)
            if key in seen:
                continue
            seen.add(key)
            examples.append(
                {
                    "id": start_id + len(examples),
                    "interview_type": item["interview_type"],
                    "mode": item["mode"],
                    "question_text": item["question_text"],
                    "answer_text": answer,
                    "answer_state": label,
                }
            )

    if len(examples) < target_count:
        raise ValueError(f"Could not generate enough examples for {label}")

    return examples[:target_count]


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
