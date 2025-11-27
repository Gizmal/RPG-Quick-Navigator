**free
ctl-opt actgrp(*new) dftactgrp(*no) bnddir('QC2LE') ccsid(*graph:*src);

dcl-f phy_file   usage(*delete:*update) extfile('PHY_FILE') keyed usropn;
dcl-f log_file   usage(*output)         extfile('LOG_FILE');
dcl-f dsp_file   workstn                extfile('DSP_FILE');
dcl-f prt_file   printer                extfile('PRT_FILE');

dcl-s z1_var     varchar(250);
dcl-s z2_char    char(200);
dcl-s z3_int     int(5);
dcl-s z4_dec     packed(10:2);
dcl-s z5_boolean ind;
dcl-s error_ind  ind;

dcl-ds z6_ds     qualified inz;
  unsigned       uns(10);
  zoned          zoned(6:1);
end-ds;

dcl-s z7_tab     char(200) dim(*auto:100);
dcl-s z8_date    date;
dcl-s z9_time    time;
dcl-s z10_ts     timestamp;
dcl-s z11_return varchar(10);
dcl-s z12_obj    object(*java:'java.lang.String');
dcl-s z13_solo   char(20) inz('Not used anywhere :(');
dcl-s z14_graph  graph(10) inz(%graph('coucou'));
dcl-s len_utf8   varchar(2) ccsid(*utf8) inz('¶');

dcl-ds rareTypes inz;
  ucs2_fix       ucs2(10);
  ucs2_var       varucs2(20);
  graph_fix      graph(10);
  graph_var      vargraph(20);
  binDec1        bindec(3);
  binDec2        bindec(7:2);
  float          float(8);
  basePtr        pointer;
  procPtr        pointer(*proc);
end-ds;

dcl-c const_num  3.14159265;
dcl-c const_char 'Smol text with a semicolon ;-)';
dcl-c const_bool *on;
dcl-c const_date d'2025-05-12';
dcl-c const_time t'13.37.00';
dcl-c const_ts   z'2024-01-26-09.00.00.000000';
dcl-c const_hex  x'ac001dad';
dcl-c const_ucs2 u'abadc0de';

dcl-enum colors  qualified;
  red    '255,0,0';
  green  '0,255,0';
  blue   '0,0,255';
end-enum;

dcl-enum numbers qualified;
  c1             1;
  c2             %len(len_utf8);
  c3             const(3);
  c4             %size(len_utf8);
  dcl-c c5       %len(z3_int);
end-enum;

// Ext prototypes
dcl-pr c_srand extproc('srand');
  seed uns(10) value;
end-pr;

dcl-pr c_rand int(10) extproc('rand');
end-pr;

dcl-pr newJavaString object extproc(*java:'java.lang.String':*constructor);
  *n varchar(30) const;
end-pr;

// Local prototypes
dcl-pr procReturn like(z11_return);
  entry like(z4_dec) value;
end-pr;

dcl-pr randomGenerator int(10);
  seed int(10) value;
end-pr;

dcl-pr useDataFiles;
end-pr;

dcl-pr useDspPrtFiles;
end-pr;

dcl-pr useTypes;
end-pr;

dcl-pr pointerProc;
  pValue pointer value;
end-pr;

// ---------------
// MAIN PROGRAM
// ---------------

exsr init;

for z3_int = 1 to 5;
  z7_tab(z3_int) = %char(z3_int);
endfor;

z4_dec = 1;
z1_var = %char(z4_dec);

dow z4_dec < 1100;
  z1_var += ', ' + %char(z4_dec);
  z4_dec *= 2;
enddo;

z8_date = %date();
z9_time = %time();
z10_ts  = %timestamp(*sys);

snd-msg *info 'Info message with a string: ''' + %trim(z2_char) + ''', a date: ' +
  %char(z8_date) + ', a time: ' + %char(z9_time) + ', and a timestamp: ' +
  %char(z10_ts) %target(*caller);

exsr subR_loop;
z11_return = procReturn(z4_dec);

dsply ('sr+proc took: ' + %char(%diff(%timestamp():z10_ts:*ms)) + 'µs');
dsply ('and returned a ' + z11_return + ' number');

useDataFiles();
callp useDspPrtFiles();

if error_ind;
  dsply 'An error occurred.';
endif;

useTypes();

*inlr = *on;
return;

// --------------
// SUBROUTINES
// --------------

begsr init;
  z1_var               = 'BOB';
  z2_char              = 'HEX=' + const_hex + ' BIN=' + const_ucs2;
  z4_dec               = const_num;
  z5_boolean           = const_bool;
  z6_ds.unsigned       = %size(z7_tab:*all);
  z6_ds.zoned          = %charcount(const_char)/10;
  z7_tab(1)            = colors.red;
  z7_tab(numbers.c2)   = colors.green;
  z7_tab(%len(z1_var)) = colors.blue;
  z8_date              = const_date;
  z9_time              = const_time;
  z10_ts               = const_ts;
endsr;

begsr subR_loop;
  for-each z2_char in z7_tab;
    z6_ds.unsigned += numbers.c1;
    z6_ds.zoned    += %charcount(z2_char);
  endfor;
endsr;

// -------------
// PROCEDURES
// -------------

dcl-proc procReturn;
  dcl-pi *n like(z11_return);
    entry like(z4_dec) value;
  end-pi;

  dcl-s random int(10);
  dcl-s result varchar(10);
  dcl-s nbr_array zoned(3) dim(*auto:5);

  nbr_array = numbers;
  reset z5_boolean;

  // TODO: handle else case
  if entry > 1000;
    z5_boolean = *on;
  else;
    // display error
  endif;

  exsr internal_sr;
  return result;

  begsr internal_sr;
    random = %int(%subdt(%timestamp():*ms));

    dou entry < 100;
      random = randomGenerator(random);
      random = %rem(random:100);
      entry -= random;
    enddo;

    select;
      when entry >= 75;
        result = 'BIG';
      when entry >= 50;
        result = 'MEDIUM';
      when entry >= 25;
        result = 'SMALL';
      when entry >= 0;
        result = 'MINUSCULE';
      other;
        result = 'NEGATIVE';
    endsl;
  endsr;

  on-exit;
    if entry in nbr_array;
      dsply ('BINGO! You got ' + %char(entry) + ', nice!');
    elseif entry >= 50;
      dsply 'Exiting victorious \o/';
    else;
      dsply 'Exiting defeated...';
    endif;
end-proc;

dcl-proc randomGenerator;
  dcl-pi *n int(10);
    seed int(10) value;
  end-pi;

  c_srand(seed);
  return c_rand();
end-proc;

dcl-proc useDataFiles;
  open phy_file;

  PHY_KEY = list.item3;
  chain(e) PHY_KEY phy_file;

  if %error;
    dsply 'File error.';
  endif;

  if %found(phy_file);
    PHY_VAL = %subst(z1_var:1:%len(%trim(z1_var)));
    update phy_filef;
  endif;

  close phy_file;

  LOG_MSG  = 'Result: ' + z11_return + ' - ' + z1_var;
  LOG_DATE = z8_date;
  LOG_TIME = z9_time;
  LOG_LVL  = %editc(z4_dec:'J');

  monitor;
    write log_filef;
  on-error;
    error_ind = *on;
  endmon;
end-proc;

dcl-proc useDspPrtFiles;
  dcl-ds prt_values qualified dim(5);
    id              int(numbers.c3);
    number          packed(7:2);
  end-ds;

  dcl-s i           int(10);
  dcl-s seed        like(i);

  read fmt1;

  if *in50 = *on;
    z5_boolean = *off;
  else;
    z5_boolean = *on;
  endif;

  DSP_MSG  = LOG_MSG;
  DSP_FLAG = z5_boolean;

  exfmt fmt2;

  PRT_MSG = 'Report from ' + %char(z8_date) + ' ' + %char(z9_time);
  PRT_NUM = z4_dec;

  seed = %int(%subdt(%timestamp():*ms));

  for i = 1 to %elem(prt_values);
    prt_values(i).id     = i;
    prt_values(i).number = %dec(%rem(randomGenerator(seed):100000):7:2);
  endfor;

  clear PRT_VAL;

  for i = 1 to %elem(prt_values);
    if i > 1;
      PRT_VAL += ', ';
    endif;
    PRT_VAL += %char(prt_values(i).id) + ': ';
    PRT_VAL += %editc(prt_values(i).number:'J');
  endfor;

  write prt_filef;
end-proc;

dcl-proc useTypes;
  dcl-pi *n;
  end-pi;

  ucs2_fix = %ucs2('HELLO WORLD');
  ucs2_var = %lower(ucs2_fix:5);

  graph_fix = z14_graph;
  graph_var = %graph(ucs2_fix + '!');

  binDec1 = 42;
  binDec2 = 1234.56;
  binDec2 -= binDec1*numbers.c4;

  float = %float(binDec2);

  basePtr = %addr(binDec2);
  procPtr = %paddr(pointerProc);
  pointerProc(basePtr);

  z12_obj = newJavaString('What is code, baby don''t hurt me, no more');
end-proc;

dcl-proc pointerProc;
  dcl-pi *n;
    pValue pointer value;
  end-pi;

  dcl-s value like(binDec2) based(pValue);

  value += numbers.c5;
  dsply ('pointerProc: bindec via pointer = ' + %char(value));
end-proc;
 
