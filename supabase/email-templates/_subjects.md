# Lumio — Templates de email (Supabase Auth)

## Como usar

1. Abre https://supabase.com/dashboard/project/pcatjumfdcxuthefixzf/auth/templates
2. Pra cada template:
   - Cola o **Assunto** no campo "Subject heading"
   - Cola o **HTML** no campo "Message body"
   - **Save changes**

---

## 1. Confirm signup

**Assunto:**
```
Confirma seu email pra começar no Lumio
```

**HTML:** ver [confirm-signup.html](./confirm-signup.html)

---

## 2. Magic Link

**Assunto:**
```
Seu link mágico do Lumio chegou ✨
```

**HTML:** ver [magic-link.html](./magic-link.html)

---

## 3. Reset Password

**Assunto:**
```
Define uma nova senha do Lumio
```

**HTML:** ver [reset-password.html](./reset-password.html)

---

## 4. Change Email Address

**Assunto:**
```
Confirma a troca do seu email no Lumio
```

**HTML:** ver [change-email.html](./change-email.html)

---

## Notas

- Imagens do Lumi servidas direto de https://www.lumioapp.net/illustrations/
- Fonts: Inter / Segoe UI / Helvetica fallback — não tem como usar Bricolage Grotesque em email
- Cores: gradient #7c3aed → #d946ef (roxo→fuchsia, idêntico ao app)
- Layout: tabela 560px (compatível com Gmail/Outlook/Apple Mail)
- Dark mode automático via media query
