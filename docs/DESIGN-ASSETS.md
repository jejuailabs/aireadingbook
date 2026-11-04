# 책 카페 디자인 수정

2026-11-04. 사용자가 첨부한 책 카페 레퍼런스를 기준으로 화면을 수정했습니다.

- 생성 도구: OpenAI 내장 image_gen, 1회 생성.
- 적용 파일: `dist/assets/reading-room-cafe.png` (1536 × 1024).
- 적용 위치: 홈 전체 배경, 원목 사이드바 배경.
- 실제 UI는 HTML/CSS로 구현: 제목, 검색, 문서 열기, 독서, 듣기, 내 서재 카드.
- 모바일: 2 × 2 카드와 접이식 메뉴. 기존 독서·나레이션·관리자 기능은 유지.
- 검증: 정적 검사, 브라우저 검색 결과, 모바일 메뉴 및 관리자 이동, 다크 모드 전환.

## 생성에 사용한 프롬프트

Use case: photorealistic-natural. Asset type: production background photograph for a premium Korean book-reading cafe web app, wide landscape 3:2 composition. Create a sophisticated, extremely photorealistic sunlit book cafe interior closely matching this composition: dark warm walnut wall/bookshelves along the far left edge; a huge tall oak framed picture window fills middle and right, looking onto a calm blue sea/lake with distant blue mountains and coastal greenery; lush trailing green ivy vines hang across the top, a single warm cream and brass pendant lamp hangs near upper middle. Honey sunlight on solid oak tabletop at lower third, white ceramic coffee cup and saucer, an open ivory book on table, small wildflower glass vase near right window sill. Comfortable dark brown linen reading armchair partly visible lower left and beige tufted armchair lower right. Window vista and softly illuminated pale sky in middle left must stay calm and spacious enough for dark Korean interface headline to be overlaid by the website. Natural textures, editorial architectural photography, filmic warm rich browns, delicate green leaves, muted blue water, believable shadows, quiet luxurious welcoming space. Full scene edge to edge, no website UI, no text, no typography, no graphic elements, no borders, no people, no logos. Keep tables and seating in bottom third so center window is open. This is a finished website hero background, NOT a website mockup.
