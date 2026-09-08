import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Request, UseGuards,
  HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProgramDto } from './dto/create-program.dto';
import { CreateCourseDto } from './dto/create-course.dto';

interface Req extends Request {
  user: { id: string; role: string };
}

@Controller()
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private readonly svc: CoursesService) {}

  // ────────────────── PROGRAMS ────────────────────────────────────────────────
  @Get('programs')
  listPrograms(@Request() req: Req) { return this.svc.listPrograms(req.user); }

  @Post('programs')
  @HttpCode(HttpStatus.CREATED)
  createProgram(@Body() dto: CreateProgramDto, @Request() req: Req) {
    return this.svc.createProgram(dto, req.user);
  }

  @Patch('programs/:id')
  updateProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateProgramDto>,
    @Request() req: Req,
  ) { return this.svc.updateProgram(id, dto, req.user); }

  @Delete('programs/:id')
  deleteProgram(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.deleteProgram(id, req.user);
  }

  // ────────────────── COURSES ─────────────────────────────────────────────────
  @Get('courses')
  listCourses(@Request() req: Req) { return this.svc.listCourses(req.user); }

  @Get('courses/:id')
  getCourse(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getCourse(id); }

  @Get('courses/:id/eligible-evaluators')
  getEligibleEvaluators(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.getEligibleEvaluators(id, req.user);
  }

  @Post('courses')
  @HttpCode(HttpStatus.CREATED)
  createCourse(@Body() dto: CreateCourseDto, @Request() req: Req) {
    return this.svc.createCourse(dto, req.user);
  }

  @Patch('courses/:id')
  updateCourse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateCourseDto>,
    @Request() req: Req,
  ) { return this.svc.updateCourse(id, dto, req.user); }

  @Patch('courses/:id/toggle-active')
  toggleCourse(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.toggleCourseActive(id, req.user);
  }

  @Delete('courses/:id')
  deleteCourse(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.deleteCourse(id, req.user);
  }

  // ────────────────── GROUPS ──────────────────────────────────────────────────
  @Get('groups')
  listGroups(@Query('course_id') courseId: string, @Request() req: Req) {
    return this.svc.listGroups(courseId ?? null, req.user);
  }

  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  createGroup(@Body() dto: Record<string, unknown>, @Request() req: Req) {
    return this.svc.createGroup(dto as Parameters<CoursesService['createGroup']>[0], req.user);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Record<string, unknown>,
    @Request() req: Req,
  ) { return this.svc.updateGroup(id, dto, req.user); }

  @Delete('groups/:id')
  deleteGroup(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.deleteGroup(id, req.user);
  }

  // ────────────────── SESSIONS ─────────────────────────────────────────────────
  @Get('sessions')
  listSessions(@Query('group_id') groupId: string) {
    return this.svc.listSessions(groupId);
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  createSession(@Body() dto: Record<string, unknown>, @Request() req: Req) {
    return this.svc.createSession(
      dto as Parameters<CoursesService['createSession']>[0],
      req.user,
    );
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.svc.deleteSession(id, req.user);
  }
}
