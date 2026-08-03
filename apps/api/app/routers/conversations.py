from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import get_current_user
from app.models import Conversation, User
from app.schemas import ConversationOut

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[Conversation]:
    return (
        db.query(Conversation)
        .options(joinedload(Conversation.customer), joinedload(Conversation.messages))
        .filter(Conversation.tenant_id == user.tenant_id)
        .order_by(Conversation.last_message_at.desc().nullslast(), Conversation.id.desc())
        .all()
    )
