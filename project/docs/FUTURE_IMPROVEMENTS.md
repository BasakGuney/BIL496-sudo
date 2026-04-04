# Future Improvements

This table captures backlog ideas beyond the quick wins in the current implementation plan.

| Category | Improvement | Description | Impact | Complexity |
| --- | --- | --- | --- | --- |
| Cost Optimization | Separate Voice + LLM Layers | Replace `gpt-realtime` with separate TTS/STT (e.g., ElevenLabs/Deepgram) + cheaper LLM (`gpt-4o-mini` or open-source). Realtime API bundles voice + LLM at premium pricing (~$40-80/hr audio). Separating could reduce cost 3-5x. | High | Medium |
| Cost Optimization | Open-Source STT | Replace Whisper API with local Whisper or Faster-Whisper for transcription. Zero marginal cost after deployment. | Medium | Low |
| Knowledge Base | Company Knowledge Base | RAG pipeline where interviewer can answer company-specific questions (culture, tech stack, benefits). Upload docs -> vector store -> retrieval during interview. | High | Medium |
| Avatar | Realtime Lip-Synced Avatar | Replace looping video with AI-generated avatar with lip sync (SadTalker, Wav2Lip, LivePortrait, HeyGen, Synthesia API). | Very High | High |
| CV Analysis | Document-Aware Interview | Upload CV/resume -> extract sections (education, experience, projects, skills) -> interviewer asks targeted questions. | High | Medium |
| CV Analysis | Dynamic Follow-ups from CV + Response | Cross-reference CV claims with live answers. If candidate says "I led a team of 10" but CV shows junior role, interviewer can probe. | Very High | High |
| Authenticity | Multi-Interviewer Panel | Simulate panel interviews with 2-3 AI interviewers (technical lead, HR, hiring manager). | High | High |
| Authenticity | Emotional Intelligence | Detect candidate stress/anxiety from voice prosody in realtime and adjust interviewer tone. | Medium | High |
| Analytics | Cross-Session Progress Tracking | Track improvement across multiple interviews. Show score trends and recurring weaknesses (requires accounts). | High | Medium |
| Language | Multi-Language Support | Extend beyond Turkish (English, German, etc.). Prompts are modular; mainly needs translation + voice selection. | Medium | Low |
| Infrastructure | Session Recording & Playback | Record full interview (audio + video) for candidate self-review. Privacy-first with consent + auto-deletion. | Medium | Medium |
| Cost Optimization | Caching Common Questions | Cache frequently generated preview questions by role/domain/difficulty to reduce API calls. | Low | Low |
| Evaluation | Benchmark Against Real Interviews | Collect anonymized real interview data to calibrate scoring vs human evaluators. | Very High | High |
