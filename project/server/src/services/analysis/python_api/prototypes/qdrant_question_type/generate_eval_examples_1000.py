import json
from itertools import product
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = BASE_DIR / "eval_examples_1000.json"

LABEL_PREFIXES = {
    "self_presentation": [
        "Kısaca,",
        "Genel çerçevede,",
        "Bir mülakatın başında,",
        "Özetle,",
    ],
    "motivation": [
        "Samimi olarak,",
        "Kısaca,",
        "Uzun vadeli açıdan bakınca,",
        "Doğrudan söylemek gerekirse,",
    ],
    "behavioral": [
        "Somut bir örnek üzerinden,",
        "Gerçek bir olay düşünerek,",
        "Davranış biçiminize odaklanarak,",
        "Adım adım anlatacak olursanız,",
    ],
    "experience": [
        "Deneyim odaklı bakarsak,",
        "Geçmiş rolleriniz üzerinden,",
        "Pratik taraftan düşünürsek,",
        "Profesyonel tecrübeniz açısından,",
    ],
    "technical_knowledge": [
        "Teknik olarak,",
        "Kavramsal düzeyde,",
        "Teorik açıdan,",
        "Temel mantığıyla,",
    ],
    "technical_experience": [
        "Kendi uygulama deneyiminiz üzerinden,",
        "Pratikte yaptığınız işlere bakarak,",
        "Gerçek bir proje örneğiyle,",
        "Teknik deneyiminiz açısından,",
    ],
    "problem_solving": [
        "Bir çözüm planı olarak,",
        "Adım adım düşünürsek,",
        "Teşhis ve aksiyon açısından,",
        "Mühendislik yaklaşımıyla,",
    ],
}

LABEL_SUFFIXES = {
    "self_presentation": [
        "Kısa bir özet paylaşır mısınız?",
        "Bir iki cümleyle aktarır mısınız?",
        "Genel resmi çizer misiniz?",
    ],
    "motivation": [
        "Temel nedeninizi vurgular mısınız?",
        "Ana motivasyon kaynağınızı söyler misiniz?",
        "Sizin için neden önemli olduğunu belirtir misiniz?",
    ],
    "behavioral": [
        "Somut adımlarınıza da değinir misiniz?",
        "Nasıl bir tutum aldığınızı da anlatır mısınız?",
        "Sonucunu da kısaca paylaşır mısınız?",
    ],
    "experience": [
        "Sorumluluklarınızı da netleştirir misiniz?",
        "Kapsamını biraz açar mısınız?",
        "Katkınızı da belirtir misiniz?",
    ],
    "technical_knowledge": [
        "Kısa bir teknik çerçeve de çizer misiniz?",
        "Temel mantığıyla özetler misiniz?",
        "Ana prensibini söyler misiniz?",
    ],
    "technical_experience": [
        "Kendi katkınızı da eklerseniz iyi olur.",
        "Kullandığınız araçları da belirtir misiniz?",
        "Teknik kararınızı da açar mısınız?",
    ],
    "problem_solving": [
        "İlk üç adımınızı da belirtir misiniz?",
        "Hangi veriye bakacağınızı da söyler misiniz?",
        "Risk azaltma planınızı da ekler misiniz?",
    ],
}


LABEL_SPECS = [
    (
        "self_presentation",
        "HR",
        143,
        [
            "{time} profesyonel yolculuğunuzu {style} özetler misiniz?",
            "Kendinizi {audience} için {style} tanıtır mısınız?",
            "{focus} ve kariyer geçmişinizi {style} anlatır mısınız?",
            "Bugünkü profesyonel profilinizi {style} paylaşır mısınız?",
            "{focus} ekseninde kendinizden {style} bahseder misiniz?",
        ],
        {
            "time": ["Bugüne kadar olan", "Kariyerinizdeki", "Şu ana kadarki", "Mezuniyetten bugüne uzanan"],
            "style": ["kısaca", "birkaç cümleyle", "genel hatlarıyla", "özet halinde"],
            "audience": ["bir mülakatın başında", "sizi tanımayan biri", "yeni bir ekip", "teknik olmayan bir yönetici"],
            "focus": ["eğitim geçmişiniz", "uzmanlık alanlarınız", "şu anki rolünüz", "güçlü yönleriniz"],
        },
    ),
    (
        "motivation",
        "HR",
        143,
        [
            "Bu {role} neden ilgi duyduğunuzu {style} anlatır mısınız?",
            "Sizi bu {domain} yönlendiren temel motivasyon {style} nedir?",
            "Neden {company_context} çalışmak istediğinizi {style} açıklar mısınız?",
            "Bu başvurunun sizin için {meaning} ne ifade ettiğini anlatır mısınız?",
            "{career_goal} ile bu rol arasındaki bağlantı nedir?",
        ],
        {
            "role": ["role", "pozisyon", "fırsat", "görev"],
            "style": ["kısaca", "biraz daha detaylı", "açık şekilde", "birkaç cümleyle"],
            "domain": ["kariyer alanına", "uzmanlık alanına", "çalışma alanına", "teknoloji alanına"],
            "company_context": ["bu ekipte", "bu şirkette", "bu kurumda", "bu organizasyonda"],
            "meaning": ["kariyeriniz açısından", "uzun vadeli hedefleriniz açısından", "kişisel gelişiminiz açısından", "bir sonraki adım olarak"],
            "career_goal": ["Uzun vadeli kariyer hedeflerinizin", "Şu anki kariyer planınızın", "Gelişim beklentilerinizin", "Profesyonel hedeflerinizin"],
        },
    ),
    (
        "behavioral",
        "HR",
        143,
        [
            "{situation} bir durumda nasıl davrandığınızı örnekle anlatır mısınız?",
            "{team_case} yaşadığınız bir olayı ve attığınız adımları paylaşır mısınız?",
            "{pressure_case} altında nasıl hareket ettiğinizi anlatır mısınız?",
            "Bir {challenge} karşısında davranışınızı nasıl uyarladınız?",
            "{feedback_case} nasıl yönettiğinizi somut bir örnekle açıklar mısınız?",
        ],
        {
            "situation": ["belirsizliğin yüksek olduğu", "çatışma yaşanan", "önceliklerin değiştiği", "zorlayıcı bir teslim tarihindeki"],
            "team_case": ["takım içinde fikir ayrılığı", "ekip içi çatışma", "anlaşmazlık", "koordinasyon sorunu"],
            "pressure_case": ["zaman baskısı", "yüksek stres", "son teslim baskısı", "ani değişim"],
            "challenge": ["zor bir ekip arkadaşınız", "beklenmedik bir engel", "gerilimli bir toplantı", "olumsuz bir geri bildirim"],
            "feedback_case": ["aldığınız olumsuz geri bildirimi", "ikna etmeniz gereken bir kişiyi", "liderlik göstermeniz gereken bir anı", "hata yaptığınız bir süreci"],
        },
    ),
    (
        "experience",
        "HR",
        143,
        [
            "{project_scope} hangi sorumlulukları üstlendiğinizi anlatır mısınız?",
            "{work_context} edindiğiniz deneyimleri biraz açar mısınız?",
            "Geçmiş rollerinizde {impact_focus} hangi katkıları sağladınız?",
            "{resume_scope} bir deneyiminizi detaylandırır mısınız?",
            "{environment} size en çok ne tür iş deneyimi kazandırdı?",
        ],
        {
            "project_scope": ["Önceki projelerinizde", "Staj dönemlerinizde", "Son çalıştığınız ekipte", "Bugüne kadarki rollerinizde"],
            "work_context": ["iş hayatınızda", "stajlarınızda", "projelerinizde", "müşteriyle temas ettiğiniz işlerde"],
            "impact_focus": ["çıktı olarak", "iş sonucu anlamında", "operasyonel açıdan", "sorumluluk düzeyinde"],
            "resume_scope": ["Özgeçmişinizde yer alan", "CV'nizde öne çıkan", "en çok sahiplik aldığınız", "sizi en çok geliştiren"],
            "environment": ["Hangi çalışma ortamı", "Hangi proje tipi", "Hangi ekip yapısı", "Hangi sorumluluk alanı"],
        },
    ),
    (
        "technical_knowledge",
        "Technical",
        143,
        [
            "{concept} kavramını {style} açıklar mısınız?",
            "{concept_pair} arasındaki fark nedir?",
            "{system_concept} neden önemlidir?",
            "{security_or_scaling} nasıl çalışır ya da hangi problemi çözer?",
            "{architecture} hangi durumlarda tercih edilir?",
        ],
        {
            "concept": ["JWT", "rate limiting", "service discovery", "eventual consistency", "connection pooling", "idempotency"],
            "style": ["temel mantığıyla", "kısa ve net biçimde", "örnek vermeden", "teorik olarak"],
            "concept_pair": [
                "authentication ile authorization",
                "horizontal scaling ile vertical scaling",
                "monitoring ile observability",
                "concurrency ile parallelism",
            ],
            "system_concept": ["cache hit oranı", "database indexing", "backpressure", "retry mekanizması"],
            "security_or_scaling": ["load balancer", "circuit breaker", "SQL injection koruması", "message queue"],
            "architecture": ["event-driven architecture", "mikroservis mimarisi", "vektör veritabanı kullanımı", "REST tabanlı API yaklaşımı"],
        },
    ),
    (
        "technical_experience",
        "Technical",
        143,
        [
            "{technology} kullandığınız bir projede ne yaptığınızı anlatır mısınız?",
            "{system_case} yaşadığınız bir deneyimi ve katkınızı paylaşır mısınız?",
            "{delivery_case} sürecinde hangi teknik kararları aldınız?",
            "{optimization_case} yaptığınız bir örneği anlatır mısınız?",
            "{infra_case} kurduğunuz ya da yönettiğiniz bir deneyimden bahseder misiniz?",
        ],
        {
            "technology": ["Redis", "Docker", "Kubernetes", "React", "Node.js", "Qdrant"],
            "system_case": [
                "gerçek kullanıcı trafiği altında performans sorunu",
                "message queue kullanan bir mimari",
                "load balancing gerektiren bir servis",
                "authentication altyapısı geliştirdiğiniz bir sistem",
            ],
            "delivery_case": [
                "CI/CD",
                "production deploy",
                "monitoring ve alerting",
                "API tasarımı",
            ],
            "optimization_case": [
                "cache iyileştirmesi",
                "index optimizasyonu",
                "test otomasyonu",
                "veritabanı performans iyileştirmesi",
            ],
            "infra_case": [
                "loglama altyapısı",
                "container tabanlı dağıtım",
                "observability yapısı",
                "arka plan job sistemi",
            ],
        },
    ),
    (
        "problem_solving",
        "Technical",
        142,
        [
            "{incident} gördüğünüzde nasıl ilerlersiniz?",
            "{design_problem} tasarlamanız gerekse ilk adımlarınız ne olur?",
            "{debug_problem} çözmek için hangi verileri toplarsınız?",
            "{risk_case} en düşük riskle nasıl yönetirsiniz?",
            "{scale_case} oluştuğunda sistemi nasıl dengelersiniz?",
        ],
        {
            "incident": [
                "prod ortamında hata oranı artışı",
                "timeout hatalarının yükselmesi",
                "ani latency artışı",
                "veri tutarsızlığı",
            ],
            "design_problem": [
                "yüksek trafikli bir bildirim sistemi",
                "eş zamanlı istek alan bir servis",
                "cache katmanı eklenmiş bir API",
                "yük dağılımı gereken bir backend",
            ],
            "debug_problem": [
                "veritabanı darboğazını",
                "memory leak şüphesini",
                "queue consumer gecikmesini",
                "deployment sonrası performans düşüşünü",
            ],
            "risk_case": [
                "yeni bir özelliği yayına almayı",
                "rollback kararını",
                "hatalı bir mikroservisi izole etmeyi",
                "kritik bir hotfix dağıtımını",
            ],
            "scale_case": [
                "iş kuyruğu birikmesi",
                "ani trafik patlaması",
                "cache invalidation kaynaklı tutarsızlık",
                "yüksek eşzamanlılık nedeniyle yarış durumu",
            ],
        },
    ),
]


def generate_examples(label, interview_type, target_count, templates, slots, start_id):
    questions = []
    seen = set()
    slot_names = list(slots.keys())
    option_product = product(*(slots[name] for name in slot_names))

    for template in templates:
        for combination in option_product:
            values = dict(zip(slot_names, combination))
            question_text = template.format(**values)
            normalized = " ".join(question_text.split()).strip()
            if normalized in seen:
                continue
            seen.add(normalized)
            questions.append(normalized)
            if len(questions) >= target_count:
                break
        option_product = product(*(slots[name] for name in slot_names))
        if len(questions) >= target_count:
            break

    if len(questions) < target_count:
        base_questions = list(questions)
        for prefix in LABEL_PREFIXES[label]:
            for question in base_questions:
                if len(questions) >= target_count:
                    break
                variant = f"{prefix} {question[0].lower()}{question[1:]}"
                normalized = " ".join(variant.split()).strip()
                if normalized in seen:
                    continue
                seen.add(normalized)
                questions.append(normalized)
            if len(questions) >= target_count:
                break

    if len(questions) < target_count:
        base_questions = list(questions)
        for suffix in LABEL_SUFFIXES[label]:
            for question in base_questions:
                if len(questions) >= target_count:
                    break
                variant = f"{question[:-1]} {suffix}" if question.endswith("?") else f"{question} {suffix}"
                normalized = " ".join(variant.split()).strip()
                if normalized in seen:
                    continue
                seen.add(normalized)
                questions.append(normalized)
            if len(questions) >= target_count:
                break

    if len(questions) < target_count:
        raise ValueError(f"Not enough unique examples generated for {label}: {len(questions)} / {target_count}")

    examples = []
    for idx, question in enumerate(questions[:target_count]):
        examples.append(
            {
                "id": start_id + idx,
                "question_text": question,
                "question_type": label,
                "interview_type": interview_type,
            }
        )

    return examples


def main():
    all_examples = []
    next_id = 1

    for label, interview_type, target_count, templates, slots in LABEL_SPECS:
        generated = generate_examples(label, interview_type, target_count, templates, slots, next_id)
        all_examples.extend(generated)
        next_id += len(generated)

    OUTPUT_PATH.write_text(json.dumps(all_examples, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(all_examples)} examples to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
