"""
PDF Timetable Export - Generates printable timetables matching manual format.

Produces landscape A4 PDFs with:
- Department header with semester/season info
- Multi-batch grid (days as columns, time periods as rows)
- Cell format: FULL_COURSE_NAME (T/P) - (FACULTY_ABBR)  [word-wrapped]
- LUNCH BREAK row
- Course Details legend table: Code -> Full Name -> Type
- Faculty Details legend table: Abbreviation -> Full Name
- Signature line
- Color-coded batch rows
"""

from flask import Blueprint, request, send_file
from flask_jwt_extended import jwt_required
from io import BytesIO
from collections import defaultdict

from ..models import (
    Teacher, Course, Section, Room, TimetableEntry,
    Department, ScheduleSettings, Program, Batch,
)
from .. import db

pdf_export_bp = Blueprint('pdf_export', __name__)

# ── Colour palette (matching the manual PDF style) ────────────────────────

BATCH_COLORS = [
    (0.56, 0.93, 0.56),  # green
    (0.53, 0.81, 0.92),  # blue
    (0.87, 0.63, 0.87),  # plum
    (0.96, 0.64, 0.38),  # sandy
    (1.00, 0.71, 0.76),  # pink
    (0.13, 0.70, 0.67),  # teal
    (0.60, 0.98, 0.60),  # light green
    (0.53, 0.81, 0.98),  # light blue
    (0.85, 0.75, 0.85),  # lavender
    (1.00, 0.87, 0.50),  # gold
]

BREAK_BG = (1.0, 1.0, 0.84)  # light yellow
DAY_HEADER_BG = (0.90, 0.93, 1.0)


# ── Helpers ──────────────────────────────────────────────────────────────

def _auto_abbreviation(name: str) -> str:
    """Create initials-based abbreviation when none is set."""
    if not name:
        return "?"
    parts = name.replace(".", "").replace("-", " ").split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    return name[:2].upper() if len(name) >= 2 else name.upper()


def _register_fonts():
    """Register DejaVu fonts (safe to call multiple times)."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('DejaVuBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))


def _make_styles():
    """Return a dict of reusable ParagraphStyle objects."""
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle

    return {
        "title": ParagraphStyle(
            'CustomTitle', fontName='DejaVuBold', fontSize=14, alignment=1,
            spaceAfter=2 * mm, textColor=colors.black,
        ),
        "subtitle": ParagraphStyle(
            'CustomSubtitle', fontName='DejaVu', fontSize=9, alignment=1,
            spaceAfter=4 * mm, textColor=colors.HexColor("#333333"),
        ),
        "cell": ParagraphStyle(
            'Cell', fontName='DejaVu', fontSize=5, leading=6.2, alignment=1,
            spaceBefore=0, spaceAfter=0,
        ),
        "day_header": ParagraphStyle(
            'DayHeader', fontName='DejaVuBold', fontSize=7, leading=9, alignment=1,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "batch_label": ParagraphStyle(
            'BatchLabel', fontName='DejaVuBold', fontSize=5, leading=7, alignment=1,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "section_title": ParagraphStyle(
            'SectionTitle', fontName='DejaVuBold', fontSize=9, spaceAfter=2 * mm,
            spaceBefore=4 * mm,
        ),
        "legend_text": ParagraphStyle(
            'LegendText', fontName='DejaVu', fontSize=7, leading=9,
        ),
        "signature": ParagraphStyle(
            'Signature', fontName='DejaVu', fontSize=7, alignment=0,
        ),
    }


def _build_course_legend_table(entries, courses, avail_w, styles):
    """
    Build a Course Details legend: Code | Full Name | Type.
    Only includes courses that appear in this department's timetable entries.
    """
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    # Collect unique course ids from entries
    seen_course_ids = set()
    unique_courses = []
    for e in entries:
        if e.course_id not in seen_course_ids:
            seen_course_ids.add(e.course_id)
            c = courses.get(e.course_id)
            if c:
                unique_courses.append(c)

    if not unique_courses:
        return []

    unique_courses.sort(key=lambda c: c.code or c.name)

    elements = []
    elements.append(Paragraph("<b>Course Details</b>", styles["section_title"]))

    # Header row
    header = [
        Paragraph("<b>Code</b>", ParagraphStyle('CH', fontName='DejaVuBold', fontSize=6.5, leading=8, alignment=0)),
        Paragraph("<b>Course Name</b>", ParagraphStyle('CH', fontName='DejaVuBold', fontSize=6.5, leading=8, alignment=0)),
        Paragraph("<b>Type</b>", ParagraphStyle('CH', fontName='DejaVuBold', fontSize=6.5, leading=8, alignment=1)),
    ]

    rows = [header]
    code_w = 30 * mm
    type_w = 15 * mm
    name_w = avail_w - code_w - type_w

    for c in unique_courses:
        code_text = c.code or "-"
        name_text = c.name or "-"
        ctype = (c.course_type or "Theory").capitalize()
        rows.append([
            code_text,
            name_text,
            Paragraph(ctype, ParagraphStyle('CT', fontName='DejaVu', fontSize=7, leading=9, alignment=1)),
        ])

    tbl = Table(rows, colWidths=[code_w, name_w, type_w])
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#2a3990")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'DejaVuBold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('FONTNAME', (0, 1), (-1, -1), 'DejaVu'),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5fa")]),
    ]))
    elements.append(tbl)
    return elements


def _build_faculty_legend_table(entries, teachers, avail_w, styles):
    """
    Build a Faculty Details legend: Abbreviation | Full Name.
    Only includes teachers that appear in this department's timetable entries.
    """
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    seen_teacher_ids = set()
    teacher_list = []
    for e in entries:
        if e.teacher_id not in seen_teacher_ids:
            seen_teacher_ids.add(e.teacher_id)
            t = teachers.get(e.teacher_id)
            if t:
                teacher_list.append(t)

    if not teacher_list:
        return []

    teacher_list.sort(key=lambda t: t.name)

    elements = []
    elements.append(Paragraph("<b>Faculty Details</b>", styles["section_title"]))

    # Two-column layout for compactness
    header_style = ParagraphStyle('FH', fontName='DejaVuBold', fontSize=6.5, leading=8, alignment=0)
    half = (len(teacher_list) + 1) // 2

    # Header row spanning two columns
    header = [
        Paragraph("<b>Abbreviation</b>", header_style),
        Paragraph("<b>Faculty Name</b>", header_style),
        Paragraph("<b>Abbreviation</b>", header_style),
        Paragraph("<b>Faculty Name</b>", header_style),
    ]
    rows = [header]

    col_w = avail_w / 4
    for i in range(half):
        left = teacher_list[i]
        right = teacher_list[i + half] if i + half < len(teacher_list) else None

        la = left.abbreviation or _auto_abbreviation(left.name)
        left_row = [la, left.name]
        right_row = [
            (right.abbreviation or _auto_abbreviation(right.name)) if right else "",
            right.name if right else "",
        ]
        rows.append(left_row + right_row)

    tbl = Table(rows, colWidths=[col_w, col_w, col_w, col_w])
    tbl.setStyle(TableStyle([
        # Header styling
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#2a3990")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'DejaVuBold'),
        # Body styling
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('FONTNAME', (0, 1), (-1, -1), 'DejaVu'),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5fa")]),
    ]))
    elements.append(tbl)
    return elements


def _build_primary_rooms(grid):
    """Determine the most-used room per batch from the grid."""
    batch_rooms = {}
    for day, day_grid in grid.items():
        for timeslot, batch_grid in day_grid.items():
            for batch_id, entries_list in batch_grid.items():
                for entry_data in entries_list:
                    if entry_data["room"]:
                        room_name = entry_data["room"].name
                        batch_rooms.setdefault(batch_id, defaultdict(int))
                        batch_rooms[batch_id][room_name] += 1
    batch_primary_room = {}
    for bid, room_counts in batch_rooms.items():
        batch_primary_room[bid] = max(room_counts, key=room_counts.get)
    return batch_primary_room


def _build_content_rows(all_slots, working_days, batches, grid, cell_style):
    """Build the timetable content rows (time slot rows with entries)."""
    content_rows = []
    num_batches = len(batches)

    for slot_info in all_slots:
        row = []
        is_break = slot_info["is_break"]

        if is_break:
            row.append("")
            row.append("")
            for _ in range(len(working_days) * num_batches):
                row.append("LUNCH\nBREAK")
            content_rows.append(row)
            continue

        # Period number
        period_num = ""
        p_count = 0
        for s in all_slots:
            if not s["is_break"]:
                p_count += 1
                if s["key"] == slot_info["key"]:
                    period_num = f"Period {p_count}"
                    break

        row.append(period_num)
        row.append(slot_info["label"])

        for day in working_days:
            day_slots = grid.get(day, {})
            slot_entries = day_slots.get(slot_info["key"], {})

            for batch in batches:
                entries_list = slot_entries.get(batch.id, [])
                if not entries_list:
                    row.append("")
                    continue

                entry = entries_list[0]
                course = entry["course"]
                teacher = entry["teacher"]
                if not course:
                    row.append("")
                    continue

                # FULL COURSE NAME (T/P) - (FACULTY_ABBR)
                course_name = course.name or course.code or ""
                course_type = "P" if entry["is_lab"] else "T"
                abbr = teacher.abbreviation or _auto_abbreviation(teacher.name) if teacher else "?"

                cell_text = f"{course_name} ({course_type})<br/>({abbr})"
                row.append(Paragraph(cell_text, cell_style))

        content_rows.append(row)

    return content_rows


def _build_table_style_cmds(all_slots, working_days, batches, has_break):
    """Build TableStyle commands for the timetable grid."""
    from reportlab.lib import colors

    num_batches = len(batches)
    batch_col_start = 2

    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        # Header rows styling
        ('BACKGROUND', (0, 0), (1, 2), colors.HexColor("#2a3990")),
        ('TEXTCOLOR', (0, 0), (1, 2), colors.white),
        ('FONTNAME', (0, 0), (1, 2), 'DejaVuBold'),
    ]

    # Day header spans
    col_idx = batch_col_start
    for _di, day in enumerate(working_days):
        span_end = col_idx + num_batches - 1
        style_cmds.append(('SPAN', (col_idx, 0), (span_end, 0)))
        style_cmds.append(('BACKGROUND', (col_idx, 0), (span_end, 0), DAY_HEADER_BG))
        style_cmds.append(('ALIGN', (col_idx, 0), (span_end, 0), 'CENTER'))
        col_idx += num_batches

    # Batch label row colours
    col_idx = batch_col_start
    for di, day in enumerate(working_days):
        for bi, batch in enumerate(batches):
            bg = BATCH_COLORS[(di * num_batches + bi) % len(BATCH_COLORS)]
            style_cmds.append(('BACKGROUND', (col_idx, 2), (col_idx, 2),
                              colors.Color(*bg, alpha=0.3)))
            col_idx += 1

    # Content row column colours (subtle alternating)
    col_idx = batch_col_start
    for di, day in enumerate(working_days):
        for bi, batch in enumerate(batches):
            bg = BATCH_COLORS[(di * num_batches + bi) % len(BATCH_COLORS)]
            alpha = 0.08 if bi % 2 == 0 else 0.15
            style_cmds.append(('BACKGROUND', (col_idx, 3), (col_idx, -1),
                              colors.Color(*bg, alpha=alpha)))
            col_idx += 1

    # Break row styling
    for ri, slot_info in enumerate(all_slots):
        if slot_info["is_break"]:
            row_num = 3 + ri
            style_cmds.append(('BACKGROUND', (2, row_num), (-1, row_num), BREAK_BG))
            style_cmds.append(('SPAN', (0, row_num), (1, row_num)))
            style_cmds.append(('ALIGN', (0, row_num), (-1, row_num), 'CENTER'))
            style_cmds.append(('FONTNAME', (0, row_num), (-1, row_num), 'DejaVuBold'))

    return style_cmds


# ── Data loader ──────────────────────────────────────────────────────────

def _build_timetable_data(dept_id: int):
    """Load and organise timetable data for PDF rendering."""
    dept = db.session.get(Department, dept_id)
    if not dept:
        return None

    entries = TimetableEntry.query.filter_by(department_id=dept_id).all()
    if not entries:
        return None

    course_ids = {e.course_id for e in entries}
    teacher_ids = {e.teacher_id for e in entries}
    room_ids = {e.room_id for e in entries}
    section_ids = set()
    for e in entries:
        for s in e.sections:
            section_ids.add(s.id)

    courses = {c.id: c for c in Course.query.filter(Course.id.in_(course_ids)).all()}
    teachers = {t.id: t for t in Teacher.query.filter(Teacher.id.in_(teacher_ids)).all()}
    rooms = {r.id: r for r in Room.query.filter(Room.id.in_(room_ids)).all()}
    sections = {s.id: s for s in Section.query.filter(Section.id.in_(section_ids)).all()}

    # Group sections by batch -> program
    batch_map = {}
    for sec in sections.values():
        batch_map[sec.batch_id] = sec.batch

    # Deduplicate batches per program
    seen_batches = set()
    unique_batches = []
    for batch_id, batch in batch_map.items():
        key = (batch.program_id, batch.code or batch.name)
        if key not in seen_batches:
            seen_batches.add(key)
            unique_batches.append(batch)

    unique_batches.sort(key=lambda b: (
        b.program.name if b.program else "",
        b.code or b.name,
    ))

    # Build grid: day -> timeslot -> batch_id -> entry list
    grid = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for e in entries:
        course = courses.get(e.course_id)
        teacher = teachers.get(e.teacher_id)
        room = rooms.get(e.room_id)
        for sec in e.sections:
            grid[e.day][e.timeslot][sec.batch_id].append({
                "course": course,
                "teacher": teacher,
                "room": room,
                "entry_id": e.id,
                "is_lab": course and course.course_type == "Lab",
            })

    # Schedule settings
    settings = ScheduleSettings.get_or_create_default()
    time_slots = settings.time_slots or []
    working_days = settings.working_days or ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    breaks = settings.breaks or []

    all_slots = []
    for ts in time_slots:
        all_slots.append({
            "key": f"{ts['start']}-{ts['end']}",
            "label": ts.get("label", f"{ts['start']}-{ts['end']}"),
            "start": ts["start"],
            "end": ts["end"],
            "is_break": False,
        })
    for br in breaks:
        all_slots.append({
            "key": f"break-{br['start']}-{br['end']}",
            "label": br.get("label", "BREAK"),
            "start": br["start"],
            "end": br["end"],
            "is_break": True,
        })
    all_slots.sort(key=lambda s: s["start"])

    return {
        "department": dept,
        "entries": entries,
        "unique_batches": unique_batches,
        "batch_map": batch_map,
        "grid": grid,
        "courses": courses,
        "teachers": teachers,
        "rooms": rooms,
        "sections": sections,
        "all_slots": all_slots,
        "working_days": working_days,
        "time_slots": time_slots,
        "breaks": breaks,
    }


# ── Single-department PDF ────────────────────────────────────────────────

def _render_pdf(data, semester_label=""):
    """Render the timetable data into a PDF bytes buffer using ReportLab."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, Paragraph

    _register_fonts()
    styles = _make_styles()

    dept = data["department"]
    batches = data["unique_batches"]
    grid = data["grid"]
    all_slots = data["all_slots"]
    working_days = data["working_days"]
    num_batches = len(batches)

    buf = BytesIO()
    page_w, page_h = landscape(A4)

    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=10 * mm, bottomMargin=10 * mm,
    )

    elements = []

    # ── Title ────────────────────────────────────────────────────────────
    elements.append(Paragraph(f"Time Table {semester_label}", styles["title"]))
    elements.append(Paragraph(f"Department of {dept.name}", styles["subtitle"]))

    # ── Build grid data ─────────────────────────────────────────────────
    batch_primary_room = _build_primary_rooms(grid)
    has_break = any(s["is_break"] for s in all_slots)
    total_day_cols = len(working_days) * num_batches
    if has_break:
        total_day_cols += num_batches

    avail_w = page_w - 20 * mm
    period_col_w = 18 * mm
    time_col_w = 22 * mm
    remaining = avail_w - period_col_w - time_col_w
    batch_col_w = remaining / max(1, total_day_cols)

    # Header rows
    header_row1 = ["", ""]
    header_row2 = ["Period", "Time"]
    batch_row = ["", ""]

    for day in working_days:
        header_row1.append(Paragraph(day.upper(), styles["day_header"]))
        header_row1.extend([""] * (num_batches - 1))
        header_row2.extend([""] * num_batches)

        for batch in batches:
            room_label = batch_primary_room.get(batch.id, "")
            prog_name = batch.program.name if batch.program else batch.name
            txt = f"{prog_name}<br/>"
            if room_label:
                txt += f"Room: {room_label}<br/>"
            txt += f"{batch.name}"
            batch_row.append(Paragraph(txt, styles["batch_label"]))

    if has_break:
        header_row1.extend([""] * num_batches)
        header_row2.extend([""] * num_batches)
        batch_row.extend([""] * num_batches)

    # Content rows
    content_rows = _build_content_rows(
        all_slots, working_days, batches, grid, styles["cell"],
    )

    table_data = [header_row1, header_row2, batch_row] + content_rows
    col_widths = [period_col_w, time_col_w] + [batch_col_w] * total_day_cols

    table = Table(table_data, colWidths=col_widths, repeatRows=3)
    table.setStyle(TableStyle(
        _build_table_style_cmds(all_slots, working_days, batches, has_break),
    ))
    elements.append(table)

    # ── Course Details Legend ────────────────────────────────────────────
    elements.append(Spacer(1, 6 * mm))
    course_elements = _build_course_legend_table(
        data["entries"], data["courses"], avail_w, styles,
    )
    elements.extend(course_elements)

    # ── Faculty Details Legend ───────────────────────────────────────────
    elements.append(Spacer(1, 4 * mm))
    faculty_elements = _build_faculty_legend_table(
        data["entries"], data["teachers"], avail_w, styles,
    )
    elements.extend(faculty_elements)

    # ── Signature line ──────────────────────────────────────────────────
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph(
        "Signature: ________________________    HOD / Coordinator",
        styles["signature"],
    ))

    # ── Build PDF ───────────────────────────────────────────────────────
    doc.build(elements)
    buf.seek(0)
    return buf


# ══════════════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════════════

@pdf_export_bp.route('/pdf/<int:dept_id>', methods=['GET'])
@jwt_required()
def export_department_pdf(dept_id):
    """Generate and download a PDF timetable for a department."""
    data = _build_timetable_data(dept_id)
    if not data:
        return {"error": "No timetable found for this department"}, 404

    semester_label = request.args.get('semester', ' - ' + data["department"].name)
    pdf_buf = _render_pdf(data, semester_label)

    safe_name = data["department"].name.replace(" ", "_").replace("/", "-")
    return send_file(
        pdf_buf,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'Timetable_{safe_name}.pdf',
    )


@pdf_export_bp.route('/pdf/all', methods=['GET'])
@jwt_required()
def export_all_departments_pdf():
    """Generate and download a combined PDF with all department timetables."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, PageBreak

    _register_fonts()

    departments = Department.query.all()
    if not departments:
        return {"error": "No departments found"}, 404

    buf = BytesIO()
    page_w, page_h = landscape(A4)

    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=10 * mm, bottomMargin=10 * mm,
    )

    elements = []
    first = True
    for dept in departments:
        data = _build_timetable_data(dept.id)
        if not data:
            continue

        if not first:
            elements.append(PageBreak())
        first = False

        part_elements = _build_department_table(data, page_w)
        elements.extend(part_elements)

    if not elements:
        return {"error": "No timetables found for any department"}, 404

    doc.build(elements)
    buf.seek(0)
    return send_file(
        buf,
        mimetype='application/pdf',
        as_attachment=True,
        download_name='Timetable_All_Departments.pdf',
    )


def _build_department_table(data, page_w):
    """Build platypus elements for a single department (used in combined PDF)."""
    from reportlab.lib.units import mm
    from reportlab.platypus import Table, TableStyle, Spacer, Paragraph

    _register_fonts()
    styles = _make_styles()

    dept = data["department"]
    batches = data["unique_batches"]
    grid = data["grid"]
    all_slots = data["all_slots"]
    working_days = data["working_days"]
    num_batches = len(batches)

    elements = []

    # ── Title ────────────────────────────────────────────────────────────
    elements.append(Paragraph(f"Time Table - {dept.name}", styles["title"]))
    elements.append(Paragraph(f"Department of {dept.name}", styles["subtitle"]))

    # ── Build grid data ─────────────────────────────────────────────────
    batch_primary_room = _build_primary_rooms(grid)
    has_break = any(s["is_break"] for s in all_slots)
    total_day_cols = len(working_days) * num_batches
    if has_break:
        total_day_cols += num_batches

    avail_w = page_w - 20 * mm
    period_col_w = 18 * mm
    time_col_w = 22 * mm
    remaining = avail_w - period_col_w - time_col_w
    batch_col_w = remaining / max(1, total_day_cols)

    # Header rows
    header_row1 = ["", ""]
    header_row2 = ["Period", "Time"]
    batch_row = ["", ""]

    for day in working_days:
        header_row1.append(Paragraph(day.upper(), styles["day_header"]))
        header_row1.extend([""] * (num_batches - 1))
        header_row2.extend([""] * num_batches)

        for batch in batches:
            room_label = batch_primary_room.get(batch.id, "")
            prog_name = batch.program.name if batch.program else batch.name
            txt = f"{prog_name}<br/>"
            if room_label:
                txt += f"Room: {room_label}<br/>"
            txt += f"{batch.name}"
            batch_row.append(Paragraph(txt, styles["batch_label"]))

    if has_break:
        header_row1.extend([""] * num_batches)
        header_row2.extend([""] * num_batches)
        batch_row.extend([""] * num_batches)

    # Content rows
    content_rows = _build_content_rows(
        all_slots, working_days, batches, grid, styles["cell"],
    )

    table_data = [header_row1, header_row2, batch_row] + content_rows
    col_widths = [period_col_w, time_col_w] + [batch_col_w] * total_day_cols

    table = Table(table_data, colWidths=col_widths, repeatRows=3)
    table.setStyle(TableStyle(
        _build_table_style_cmds(all_slots, working_days, batches, has_break),
    ))
    elements.append(table)

    # ── Course Details Legend ────────────────────────────────────────────
    elements.append(Spacer(1, 6 * mm))
    course_elements = _build_course_legend_table(
        data["entries"], data["courses"], avail_w, styles,
    )
    elements.extend(course_elements)

    # ── Faculty Details Legend ───────────────────────────────────────────
    elements.append(Spacer(1, 4 * mm))
    faculty_elements = _build_faculty_legend_table(
        data["entries"], data["teachers"], avail_w, styles,
    )
    elements.extend(faculty_elements)

    # ── Signature line ──────────────────────────────────────────────────
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph(
        "Signature: ________________________    HOD / Coordinator",
        styles["signature"],
    ))

    return elements
