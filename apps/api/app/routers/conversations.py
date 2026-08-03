import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_vendor_user
from app.models import Channel, Conversation, Message, MessageDirection, User
from app.schemas import ConversationOut, MessageOut, SendMessageIn
from app.whatsapp_client import WhatsAppSendError, send_text_message
from app.whatsapp_creds import resolve_whatsapp_credentials

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _get_vendor_conversation(db: Session, user: User, conversation_id: int) -> Conversation:
    conversation = (
        db.query(Conversation)
        .options(joinedload(Conversation.customer), joinedload(Conversation.messages))
        .filter(Conversation.id == conversation_id, Conversation.tenant_id == user.tenant_id)
        .first()
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    user: User = Depends(require_vendor_user), db: Session = Depends(get_db)
) -> list[Conversation]:
    return (
        db.query(Conversation)
        .options(joinedload(Conversation.customer), joinedload(Conversation.messages))
        .filter(Conversation.tenant_id == user.tenant_id)
        .order_by(Conversation.last_message_at.desc().nullslast(), Conversation.id.desc())
        .all()
    )


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: int,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Conversation:
    return _get_vendor_conversation(db, user, conversation_id)


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
def send_conversation_message(
    conversation_id: int,
    payload: SendMessageIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Message:
    conversation = _get_vendor_conversation(db, user, conversation_id)
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is empty")

    if conversation.channel != Channel.whatsapp:
        raise HTTPException(status_code=400, detail="Only WhatsApp send is supported right now")

    to_phone = conversation.external_thread_id
    if conversation.customer and conversation.customer.phone:
        to_phone = conversation.customer.phone

    access_token, phone_number_id = resolve_whatsapp_credentials(user.tenant)
    try:
        result = send_text_message(
            to_phone=to_phone,
            body=body,
            phone_number_id=phone_number_id,
            access_token=access_token,
        )
    except WhatsAppSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    external_id = None
    messages = result.get("messages") or []
    if messages:
        external_id = messages[0].get("id")

    now = datetime.now(timezone.utc)
    message = Message(
        conversation_id=conversation.id,
        direction=MessageDirection.outbound,
        body=body,
        raw_payload=json.dumps(result),
        external_message_id=external_id,
    )
    conversation.last_message_at = now
    conversation.status = "open"
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
